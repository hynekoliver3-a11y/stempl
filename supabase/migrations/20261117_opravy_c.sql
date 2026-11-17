-- Štempl – opravy z testování (17. 11. 2026), provedeno jako opravy_c1_funkce a opravy_c2_zkusebni_doba_30.
-- 1) Uvítací razítko není návštěva: join_card dává stamps = 1, ale total_stamps = 0;
--    private.is_visit nepočítá src = 'welcome' (dlaždice Razítka za 30 dní, graf, souhrn).
-- 2) Převod z papírové kartičky jen u nové karty: private.can_import (do 7 dní, bez vydané odměny),
--    kontrola v import_paper_v2 (chyba import_too_late), import_paper_stamps volá import_paper_v2.
-- 5) Zámek přihlášení až po 20 chybách za 15 minut (wifi v podniku sdílí jednu IP adresu).
-- 10) Stávající podniky bez předplatného dostaly slíbených 30 dní zkušební doby od registrace.
--
-- Plné znění funkcí je v historii migrací v Supabase (Database → Migrations). Změna dat:
update public.businesses
   set trial_ends_at = created_at + interval '30 days', reminded_trial_3d = null, reminded_trial_end = null
 where not billing_comp and stripe_subscription_id is null and trial_ends_at < created_at + interval '30 days';
