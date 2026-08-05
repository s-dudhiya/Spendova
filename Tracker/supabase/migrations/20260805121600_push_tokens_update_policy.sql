-- Add missing UPDATE policy for user_push_tokens to fix upsert errors

CREATE POLICY "Users can update their own push tokens" 
ON public.user_push_tokens FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
