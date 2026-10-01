-- Services and prices move from code into the database so the owner can edit them.
-- minutes = how long it takes (shown to customers); the booking grid uses
-- ceil(minutes / 30) half-hour slots.
CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    note_en TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 30,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO services (id,name,name_en,note,note_en,price,minutes,active,sort,created_at) VALUES
  ('haircut',  'ตัดผม',              'Haircut',            'รวมสระ',              'Wash included',        300,  60, 1, 1, datetime('now')),
  ('beard',    'ตกแต่งเครา',         'Beard Trim',         '',                    '',                     200,  20, 1, 2, datetime('now')),
  ('shave',    'โกนหนวด',            'Men''s Shave',       '',                    '',                     200,  20, 1, 3, datetime('now')),
  ('dye',      'ย้อมผม',             'Hair Dyeing',        'ส่วนเสริมคู่กับตัดผม', 'Add-on with a haircut', 150,  20, 1, 4, datetime('now')),
  ('mustache', 'ตกแต่งหนวด',         'Mustache',           '',                    '',                     500,  30, 1, 5, datetime('now')),
  ('stacking', 'เซ็ตทรง / Stacking', 'Stacking / Restyle', 'จัดทรงเต็ม',          'Full restyle',         1000, 90, 1, 6, datetime('now'));

-- Prices a bill was charged at, e.g. {"haircut":300,"beard":200}, so changing a
-- price later never changes past bills or past income.
ALTER TABLE bookings ADD COLUMN prices TEXT;
UPDATE bookings SET prices='{"haircut":300,"beard":200,"shave":200,"dye":150,"mustache":500,"stacking":1000}' WHERE prices IS NULL;
