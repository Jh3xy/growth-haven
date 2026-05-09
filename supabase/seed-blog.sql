




-- supabase/seed-blog.sql
-- Seed script for dummy blog members, posts and likes.
-- Adds `members.is_dummy` if missing, inserts dummy members,
-- creates dummy posts, and attempts to seed likes via the
-- existing `public.process_post_like` RPC (captures wallet txns).
-- Run in Supabase SQL editor or with psql as a privileged user.

BEGIN;

-- 1) Ensure the members.is_dummy column exists
ALTER TABLE public.members
	ADD COLUMN IF NOT EXISTS is_dummy boolean DEFAULT false;

-- 2) Insert dummy members, dummy posts, then seed likes
DO $$
DECLARE
	dummy_names text[] := ARRAY[
		'GrowthHaven|Support',
		'GrowthHaven|Media',
		'GrowthHaven|News',
		'Chinedu|Okoro',
		'Aisha|Mohammed',
		'Olumide|Adebayo',
		'Fatima|Ibrahim',
		'Emeka|Nwankwo',
		'Blessing|Okafor',
		'Musa|Abubakar',
		'Ngozi|Eze',
		'Adewale|Ogunleye',
		'Zainab|Bello',
		'Sipho|Dlamini',
		'Thabo|Nkosi',
		'Amina|Yusuf',
		'Kwame|Mensah',
		'Nkechi|Amadi',
		'Olufemi|Adekunle',
		'Juma|Otieno',
		'Lerato|Botha',
		'Ibrahim|Sani',
		'Chioma|Onuoha',
		'Kofi|Owusu',
		'Funke|Adeyemi',
		'Ahmed|Kamau',
		'Sizwe|Mthembu',
		'Ifeanyi|Chukwu',
		'Maryam|Abdullahi',
		'Tunde|Balogun',
		'Achieng|Anyango',
		'Samuel|Boateng',
		'Yemi|Ojo',
		'Zanele|Khumalo',
		'Chukwudi|Ezeani',
		'Esther|Adebayo',
		'Hassan|Mwangi',
		'Precious|Nwosu',
		'Bandile|Zulu',
		'Abubakar|Usman',
		'Adwoa|Asante',
		'Michael|Okafor',
		'Lerato|Moloi',
		'John|Smith',
		'Sarah|Johnson',
		'David|Williams',
		'Amina|Suleiman',
		'Oladapo|Akintola',
		'Grace|Mensah',
		'Kelvin|Odhiambo'
	];

	v_member_ids uuid[] := ARRAY[]::uuid[];
	v_post_ids uuid[] := ARRAY[]::uuid[];
	v_first text;
	v_last text;
	v_email text;
	v_member_id uuid;
	v_post_id uuid;
	v_content text;
	v_sample text[] := ARRAY[
		'Sharing a quick tip on disciplined saving — consistency wins.',
		'Long-term investing is a marathon, not a sprint.',
		'Diversify across sectors and stay patient with winners.',
		'A small daily habit compounds into significant results.',
		'Thinking of starting a SIP? Here are three things to check.',
		'Market volatility presents opportunities for those prepared.',
		'Remember to review fees — they quietly eat returns.',
		'Reinvest dividends for compounding growth over time.',
		'This platform helps users build disciplined investment habits.',
		'Compound interest is powerful — the earlier, the better.'
	];

	i int;
BEGIN
	-- Insert members (id chosen deterministically if email exists)
	FOR i IN array_lower(dummy_names,1)..array_upper(dummy_names,1) LOOP
		v_first := split_part(dummy_names[i],'|',1);
		v_last  := split_part(dummy_names[i],'|',2);
		v_email := lower(regexp_replace(v_first, '\\s+','', 'g')) || '.' || lower(regexp_replace(v_last, '\\s+','', 'g')) || '.seed@growthhaven.test';

		SELECT id INTO v_member_id FROM public.members WHERE email = v_email;
		IF v_member_id IS NULL THEN
			v_member_id := gen_random_uuid();
			INSERT INTO public.members (id, email, first_name, last_name, referral_code, is_dummy, wallet_balance, has_deposited, promoter)
			VALUES (v_member_id, v_email, v_first, v_last, public.generate_referral_code(v_first, v_last), true, 0, true, false)
			ON CONFLICT DO NOTHING;
		END IF;

		v_member_ids := array_append(v_member_ids, v_member_id);
	END LOOP;

	-- Create dummy posts (~120)
	FOR i IN 1..120 LOOP
		v_post_id := gen_random_uuid();
		v_member_id := v_member_ids[(floor(random()*array_length(v_member_ids,1))::int) + 1];
		v_content := v_sample[(floor(random()*array_length(v_sample,1))::int) + 1]
								 || ' — Post #' || i || ' from ' || substr((select first_name||' '||last_name from public.members where id = v_member_id),1,220);

		IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'title') THEN
			INSERT INTO public.posts (id, user_id, title, content, created_at, is_dummy)
			VALUES (v_post_id, v_member_id, left(v_content, 48), v_content, now() - (random() * 365 || ' days')::interval, true)
			ON CONFLICT DO NOTHING;
		ELSE
			INSERT INTO public.posts (id, user_id, content, created_at, is_dummy)
			VALUES (v_post_id, v_member_id, v_content, now() - (random() * 365 || ' days')::interval, true)
			ON CONFLICT DO NOTHING;
		END IF;

		v_post_ids := array_append(v_post_ids, v_post_id);
	END LOOP;

	-- Seed likes by calling process_post_like; ignore errors (duplicates/self-likes)
	FOR i IN 1..350 LOOP
		v_post_id := v_post_ids[(floor(random()*array_length(v_post_ids,1))::int) + 1];
		v_member_id := v_member_ids[(floor(random()*array_length(v_member_ids,1))::int) + 1];

		-- skip if owner == liker
		IF (SELECT user_id = v_member_id FROM public.posts WHERE id = v_post_id) THEN
			CONTINUE;
		END IF;

		BEGIN
			PERFORM public.process_post_like(v_post_id, v_member_id);
		EXCEPTION WHEN OTHERS THEN
			RAISE NOTICE 'process_post_like error for post % by member %: %', v_post_id, v_member_id, SQLERRM;
		END;
	END LOOP;

	RAISE NOTICE 'Seed complete: % members, % posts, upto % likes attempted', array_length(v_member_ids,1), array_length(v_post_ids,1), 350;

END;
$$ LANGUAGE plpgsql;

COMMIT;




