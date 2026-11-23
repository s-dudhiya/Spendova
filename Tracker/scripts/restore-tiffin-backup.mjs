import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "Tracker/.env") });

const SUPABASE_URL = "https://kmllvchwuhrnnahksurt.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const backupPath = "C:/Users/shabbir.dudhiyawala/spendova_backups/backup_2026-11-23T11-06-14.953Z.json";
const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const tiffinId = "b939208b-7e34-4c99-97d3-4a346d442cd4";

async function restore() {
  console.log("Restoring Tiffin expenses & splits from backup...");
  
  // Find all Tiffin expenses in backup
  const tiffinExpenses = backupData.expenses.filter(e => e.group_id === tiffinId);
  console.log(`Found ${tiffinExpenses.length} Tiffin expenses in backup.`);

  let restoredSplitsCount = 0;
  for (const exp of tiffinExpenses) {
    // Restore expense status
    await supabase.from("expenses").update({ status: exp.status }).eq("id", exp.id);

    // Restore each split
    for (const split of exp.expense_splits || []) {
      const { error } = await supabase.from("expense_splits").update({
        amount_paid: split.amount_paid,
        has_paid: split.has_paid,
      }).eq("id", split.id);

      if (error) {
        console.error(`Error restoring split ${split.id}:`, error.message);
      } else {
        restoredSplitsCount++;
      }
    }
  }

  // Also remove any settlements in Tiffin created after the backup:
  const backupSettlementIds = new Set(backupData.settlements.map(s => s.id));
  const { data: currentSettlements } = await supabase
    .from("split_settlements")
    .select("id, amount, created_at")
    .eq("group_id", tiffinId);

  for (const s of currentSettlements || []) {
    if (!backupSettlementIds.has(s.id)) {
      console.log(`Removing newly created settlement: ${s.id} (amount: ${s.amount})`);
      await supabase.from("split_settlement_applications").delete().eq("settlement_id", s.id);
      await supabase.from("split_settlements").delete().eq("id", s.id);
    }
  }

  console.log(`Restored ${restoredSplitsCount} splits across ${tiffinExpenses.length} expenses.`);
  console.log("Database restore complete!");
}

restore().catch(console.error);
