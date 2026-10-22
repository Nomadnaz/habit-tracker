-- ═══════════════════════════════════════════════════════════════════════════
-- 032_sugar.sql — track sugar alongside calories and macros
--
-- meals.sugar_g: grams of total sugars in the item, as food labels print them
-- ("of which sugars"). nutrition_targets.sugar_g: the daily limit; 90 g is the
-- UK/EU reference intake for total sugars, the figure labels' %RI uses.
-- Additive, defaulted, idempotent — old clients keep working.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE meals             ADD COLUMN IF NOT EXISTS sugar_g NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE nutrition_targets ADD COLUMN IF NOT EXISTS sugar_g NUMERIC NOT NULL DEFAULT 90;
