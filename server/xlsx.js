"use strict";

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i += 1) {
        crc ^= buf[i];
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value, 0);
    return buf;
}

function u32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
}

function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
        const name = Buffer.from(file.name, "utf8");
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
        const crc = crc32(data);
        const local = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(data.length),
            u32(data.length),
            u16(name.length),
            u16(0),
            name,
            data
        ]);
        locals.push(local);
        centrals.push(Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x01, 0x02]),
            u16(20),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(data.length),
            u32(data.length),
            u16(name.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            name
        ]));
        offset += local.length;
    });
    const central = Buffer.concat(centrals);
    const end = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        u16(0),
        u16(0),
        u16(files.length),
        u16(files.length),
        u32(central.length),
        u32(offset),
        u16(0)
    ]);
    return Buffer.concat(locals.concat([central, end]));
}

function xmlEscape(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function colName(index) {
    let n = index + 1;
    let name = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        n = Math.floor((n - 1) / 26);
    }
    return name;
}

function styleAttr(cell) {
    if (cell && cell.h) {
        return " s=\"1\"";
    }
    if (cell && cell.w) {
        return " s=\"2\"";
    }
    return "";
}

function sheetXml(rows, widths) {
    const cols = (widths || []).map((width, index) => (
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    )).join("");
    const body = rows.map((row, r) => {
        const cells = row.map((cell, c) => {
            const ref = `${colName(c)}${r + 1}`;
            const style = styleAttr(cell);
            if (cell && cell.n) {
                return `<c r="${ref}"${style}><v>${Number(cell.v) || 0}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell && cell.v)}</t></is></c>`;
        }).join("");
        return `<row r="${r + 1}" ht="20" customHeight="1">${cells}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="20" defaultColWidth="16"/>
${cols ? `<cols>${cols}</cols>` : ""}
<sheetData>${body}</sheetData>
</worksheet>`;
}

function workbook(sheets) {
    const names = sheets.map((sheet, index) => (
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )).join("");
    const rels = sheets.map((sheet, index) => (
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )).join("");
    const files = [
        {
            name: "[Content_Types].xml",
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`
        },
        {
            name: "_rels/.rels",
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
        },
        {
            name: "xl/workbook.xml",
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names}</sheets>
</workbook>`
        },
        {
            name: "xl/_rels/workbook.xml.rels",
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${rels}
</Relationships>`
        },
        {
            name: "xl/styles.xml",
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="13"/><name val="Calibri"/></font>
<font><b/><sz val="13"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border/></borders>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
</cellXfs>
</styleSheet>`
        }
    ];
    sheets.forEach((sheet, index) => {
        files.push({
            name: `xl/worksheets/sheet${index + 1}.xml`,
            data: sheetXml(sheet.rows, sheet.widths)
        });
    });
    return zipStore(files);
}

module.exports = {
    workbook,
    s: (v) => ({ v }),
    n: (v) => ({ v, n: true }),
    h: (v) => ({ v, h: true })
};
