-- Update sync_ledger_expense to support p_created_at

CREATE OR REPLACE FUNCTION public.sync_ledger_expense(
  p_action TEXT, -- 'insert', 'update', 'delete'
  p_ledger_id UUID,
  p_user_id UUID,
  p_expense_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'pending',
  p_month SMALLINT DEFAULT NULL,
  p_year SMALLINT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ledger_type TEXT;
  v_linked_expense_id UUID;
  v_new_ledger_expense_id UUID;
  v_old_title TEXT;
  v_old_amount NUMERIC;
BEGIN
  -- Verify permissions
  IF NOT is_ledger_member(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized access to ledger.');
  END IF;

  SELECT ledger_type INTO v_ledger_type FROM ledgers WHERE id = p_ledger_id;

  IF p_action = 'insert' THEN
    IF v_ledger_type = 'personal' THEN
      INSERT INTO expenses (user_id, amount, category, category_id, note, paid_by, status, split_type, group_id, created_at)
      VALUES (
        p_user_id, 
        p_amount, 
        COALESCE(p_title, p_category, 'Expense'), 
        p_category_id,
        p_notes, 
        p_user_id, 
        'cleared', 
        'none', 
        NULL,
        COALESCE(p_created_at, now())
      )
      RETURNING id INTO v_linked_expense_id;
    END IF;

    INSERT INTO ledger_expenses (
      ledger_id, user_id, title, amount, category, category_id, linked_expense_id, notes, status, month, year, created_at
    ) VALUES (
      p_ledger_id, p_user_id, p_title, p_amount, p_category, p_category_id, v_linked_expense_id, p_notes, p_status, p_month, p_year, COALESCE(p_created_at, now())
    ) RETURNING id INTO v_new_ledger_expense_id;

    INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_ledger_id, p_user_id, 'expense_submitted', 'expense', v_new_ledger_expense_id, jsonb_build_object('title', p_title, 'amount', p_amount));

    RETURN jsonb_build_object('success', true, 'expense_id', v_new_ledger_expense_id);

  ELSIF p_action = 'update' THEN
    -- Check permissions: only owner/admin or the author (if pending) can update
    IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
      IF NOT EXISTS (SELECT 1 FROM ledger_expenses WHERE id = p_expense_id AND user_id = p_user_id AND status = 'pending') THEN
        RETURN jsonb_build_object('error', 'Unauthorized to update this expense.');
      END IF;
    END IF;

    SELECT linked_expense_id INTO v_linked_expense_id FROM ledger_expenses WHERE id = p_expense_id;

    IF v_linked_expense_id IS NOT NULL AND v_ledger_type = 'personal' THEN
      UPDATE expenses SET
        amount = COALESCE(p_amount, amount),
        category = COALESCE(p_title, p_category, category),
        category_id = COALESCE(p_category_id, category_id),
        note = COALESCE(p_notes, note),
        created_at = COALESCE(p_created_at, created_at),
        updated_at = now()
      WHERE id = v_linked_expense_id;
    END IF;

    UPDATE ledger_expenses SET
      title = COALESCE(p_title, title),
      amount = COALESCE(p_amount, amount),
      category = COALESCE(p_category, category),
      category_id = COALESCE(p_category_id, category_id),
      notes = COALESCE(p_notes, notes),
      created_at = COALESCE(p_created_at, created_at),
      updated_at = now()
    WHERE id = p_expense_id;

    RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);

  ELSIF p_action = 'delete' THEN
    -- Check permissions: only owner/admin or the author (if pending) can delete
    IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
      IF NOT EXISTS (SELECT 1 FROM ledger_expenses WHERE id = p_expense_id AND user_id = p_user_id AND status = 'pending') THEN
        RETURN jsonb_build_object('error', 'Unauthorized to delete this expense.');
      END IF;
    END IF;

    SELECT linked_expense_id, title, amount INTO v_linked_expense_id, v_old_title, v_old_amount 
    FROM ledger_expenses WHERE id = p_expense_id;

    DELETE FROM ledger_expenses WHERE id = p_expense_id;

    IF v_linked_expense_id IS NOT NULL AND v_ledger_type = 'personal' THEN
      DELETE FROM expenses WHERE id = v_linked_expense_id;
    END IF;

    INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_ledger_id, p_user_id, 'expense_deleted', 'expense', p_expense_id, jsonb_build_object('title', v_old_title, 'amount', v_old_amount));

    RETURN jsonb_build_object('success', true);
  
  ELSE
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;
END;
$$;
