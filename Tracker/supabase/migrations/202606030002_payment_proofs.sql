ALTER TABLE public.split_settlements
ADD COLUMN IF NOT EXISTS payment_proof_path text,
ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at timestamptz,
ADD COLUMN IF NOT EXISTS payment_proof_deleted_at timestamptz;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 2097152, ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/webp']::text[];

DROP POLICY IF EXISTS "Users can upload own payment proofs" ON storage.objects;
CREATE POLICY "Users can upload own payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Involved users can view payment proofs" ON storage.objects;
CREATE POLICY "Involved users can view payment proofs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.split_settlements settlement
      WHERE settlement.payment_proof_path = storage.objects.name
        AND (
          settlement.from_user_id = auth.uid()
          OR settlement.to_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.group_members member
            WHERE member.group_id = settlement.group_id
              AND member.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.expenses expense
            WHERE expense.id = settlement.expense_id
              AND (expense.user_id = auth.uid() OR expense.paid_by = auth.uid())
          )
        )
    )
  )
);

DROP POLICY IF EXISTS "Proof uploaders and admins can delete payment proofs" ON storage.objects;
CREATE POLICY "Proof uploaders and admins can delete payment proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payment-proofs'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);
