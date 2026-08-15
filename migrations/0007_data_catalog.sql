CREATE TABLE data_scopes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('entity', 'overlay')),
  status TEXT NOT NULL CHECK (status IN ('active', 'planned', 'retired')),
  source_key TEXT,
  source_name TEXT,
  source_url TEXT,
  source_version TEXT,
  terms_url TEXT,
  license_note TEXT,
  content_version TEXT,
  source_observed_at TEXT,
  imported_at TEXT,
  disclaimer TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO app_metadata (key, value, updated_at)
VALUES (
  'global_disclaimer',
  '本站为城市地理与居住数据研究工具。挂牌均价、招生范围、轨道交通及规划信息均具有时间性，仅供研究参考，不构成入学承诺、购房建议或投资依据，请以主管部门最新公告为准。',
  datetime('now')
)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
