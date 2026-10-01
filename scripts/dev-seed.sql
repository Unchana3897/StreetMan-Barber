-- LOCAL DEVELOPMENT ONLY. Loaded by `npm run db:seed:local` into the local D1 copy.
-- Never run against --remote. Test password for rim/bank/pos: localdev-cfd8a893
-- "dee" keeps the old leaked default password to test the forced password change.
INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active,status,must_change_password) VALUES
  ('rim','Rim','rim','pbkdf2$100000$49cfea62c8dc3717d678559038190024$338dcc979452b58cacd5928dd56a99c776b3bf29921fe736f88a441663475fb5','owner',1,'approved',0),
  ('bank','Bank','bank','pbkdf2$100000$49cfea62c8dc3717d678559038190024$338dcc979452b58cacd5928dd56a99c776b3bf29921fe736f88a441663475fb5','barber',1,'approved',0),
  ('dee','Dee','dee','sha256:a854b41c0bb1f3658441aecc0f575dba70259d688c15c2b06b6fae30042a7be5','barber',1,'approved',1),
  ('pos','เคาน์เตอร์','pos','pbkdf2$100000$49cfea62c8dc3717d678559038190024$338dcc979452b58cacd5928dd56a99c776b3bf29921fe736f88a441663475fb5','cashier',1,'approved',0);
