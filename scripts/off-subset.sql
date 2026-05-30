-- One pass over the 72 GB NDJSON dump → a compact in-memory table of just the
-- fields we need. Every measurement below then runs instantly off that table.
PRAGMA enable_progress_bar;

CREATE OR REPLACE TABLE p AS
SELECT
  code,
  CASE WHEN lower(nutriscore_grade) IN ('a','b','c','d','e')
       THEN lower(nutriscore_grade) END AS nutri,
  CASE WHEN lower(coalesce(environmental_score_grade, ecoscore_grade)) IN ('a','b','c','d','e')
       THEN lower(coalesce(environmental_score_grade, ecoscore_grade)) END AS green,
  CASE WHEN TRY_CAST(nova_group AS INTEGER) BETWEEN 1 AND 4
       THEN TRY_CAST(nova_group AS INTEGER) END AS nova,
  list_contains(countries_tags, 'en:france') AS is_fr
FROM read_ndjson(
  'openfoodfacts-products.jsonl',
  columns = {
    code: 'VARCHAR',
    nutriscore_grade: 'VARCHAR',
    environmental_score_grade: 'VARCHAR',
    ecoscore_grade: 'VARCHAR',
    nova_group: 'VARCHAR',
    countries_tags: 'VARCHAR[]'
  },
  ignore_errors = true,
  maximum_object_size = 67108864
);

.print '=== COUNTS ==='
SELECT
  count(*)                                                        AS total_rows,
  count(*) FILTER (WHERE code SIMILAR TO '\d{8,14}')              AS valid_ean,
  count(*) FILTER (WHERE nutri IS NOT NULL
                      OR green IS NOT NULL
                      OR nova  IS NOT NULL)                       AS with_any_score,
  count(*) FILTER (WHERE (nutri IS NOT NULL OR green IS NOT NULL OR nova IS NOT NULL)
                      AND is_fr)                                  AS fr_with_score,
  count(*) FILTER (WHERE nutri IS NOT NULL)                       AS has_nutri,
  count(*) FILTER (WHERE green IS NOT NULL)                       AS has_green,
  count(*) FILTER (WHERE nova  IS NOT NULL)                       AS has_nova
FROM p;

-- Write the real artifacts so we can measure on-disk + gzipped size.
.print '=== WRITING SUBSETS ==='
COPY (
  SELECT code,
         coalesce(nutri,'') AS n,
         coalesce(green,'') AS g,
         coalesce(nova::VARCHAR,'') AS v
  FROM p
  WHERE code SIMILAR TO '\d{8,14}'
    AND (nutri IS NOT NULL OR green IS NOT NULL OR nova IS NOT NULL)
) TO 'scripts/off-scores-world.csv' (HEADER false);

COPY (
  SELECT code,
         coalesce(nutri,'') AS n,
         coalesce(green,'') AS g,
         coalesce(nova::VARCHAR,'') AS v
  FROM p
  WHERE code SIMILAR TO '\d{8,14}'
    AND is_fr
    AND (nutri IS NOT NULL OR green IS NOT NULL OR nova IS NOT NULL)
) TO 'scripts/off-scores-fr.csv' (HEADER false);

.print '=== DONE ==='
