CREATE OR REPLACE FUNCTION public.get_unprocessed_users(p_month_date date, p_limit int)
RETURNS TABLE (user_id uuid, full_name text, username text) AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id, p.full_name, p.username
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.monthly_category_stats mcs 
    WHERE mcs.user_id = p.user_id 
    AND mcs.month_date = p_month_date
    AND mcs.category_name = 'Total'
  )
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.get_unprocessed_users(date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unprocessed_users(date, int) TO service_role;
