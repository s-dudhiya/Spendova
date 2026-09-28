-- Migration: Smart In-App User Feedback & Admin Rollout System
-- Description: Adds feedback round tracking to site_settings, user feedback tracking to profiles,
--              creates app_ratings table, and RPCs for submitting feedback and rolling out new rounds.

-- 1. Add feedback columns to site_settings if not present (defaults to 0: inactive until Admin rolls it out)
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS feedback_round INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS feedback_min_days INT NOT NULL DEFAULT 4;

-- Ensure feedback_round is 0 initially so no user receives the feedback modal until Admin triggers the rollout
UPDATE public.site_settings 
SET feedback_round = 0 
WHERE feedback_round IS NULL;

-- 2. Add last_feedback_round_submitted to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_feedback_round_submitted INT NOT NULL DEFAULT 0;

-- 3. Create app_ratings table to store preserved user ratings across rounds
CREATE TABLE IF NOT EXISTS public.app_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    selected_tags TEXT[] DEFAULT '{}',
    comment TEXT,
    round_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fast query indices
CREATE INDEX IF NOT EXISTS idx_app_ratings_user_id ON public.app_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_app_ratings_round ON public.app_ratings(round_number);
CREATE INDEX IF NOT EXISTS idx_app_ratings_created_at ON public.app_ratings(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.app_ratings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can insert their own rating" ON public.app_ratings;
DROP POLICY IF EXISTS "Users can read their own rating" ON public.app_ratings;
DROP POLICY IF EXISTS "Authenticated users can read all ratings" ON public.app_ratings;

-- Policy: Users can insert their own feedback rating
CREATE POLICY "Users can insert their own rating" ON public.app_ratings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Authenticated users (including admin panel) can read ratings
CREATE POLICY "Authenticated users can read all ratings" ON public.app_ratings
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. RPC: Submit app rating and atomically update user's profile
CREATE OR REPLACE FUNCTION public.submit_app_rating(
    p_rating INT,
    p_sentiment TEXT,
    p_selected_tags TEXT[],
    p_comment TEXT,
    p_round_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_rating_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Insert rating
    INSERT INTO public.app_ratings (
        user_id,
        rating,
        sentiment,
        selected_tags,
        comment,
        round_number
    ) VALUES (
        v_user_id,
        p_rating,
        p_sentiment,
        p_selected_tags,
        p_comment,
        p_round_number
    ) RETURNING id INTO v_rating_id;

    -- Update user's profile state
    UPDATE public.profiles
    SET last_feedback_round_submitted = p_round_number,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'rating_id', v_rating_id);
END;
$$;

-- 5. RPC: Admin rollout of a new feedback round
CREATE OR REPLACE FUNCTION public.roll_out_feedback_round()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_round INT;
BEGIN
    UPDATE public.site_settings
    SET feedback_round = COALESCE(feedback_round, 0) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = 1
    RETURNING feedback_round INTO new_round;
    
    RETURN new_round;
END;
$$;
