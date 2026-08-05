
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient('https://kmllvchwuhrnnahksurt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbGx2Y2h3dWhybm5haGtzdXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NDMwMzYsImV4cCI6MjA3NDAxOTAzNn0.xAVAI_o058aFKsWLHcA4LsxzNFRYIHZ6ylC_BYd0s5I')
async function run() {
  const { data } = await supabase.from('notifications').select('user_id, actor_id, title, entity_id').order('created_at', { ascending: false }).limit(10)
  console.log(JSON.stringify(data, null, 2))
}
run()

