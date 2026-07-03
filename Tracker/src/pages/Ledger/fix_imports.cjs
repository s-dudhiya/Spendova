const fs = require('fs');
const path = require('path');

function replaceImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.tsx')) {
      const p = path.join(dir, file);
      let content = fs.readFileSync(p, 'utf8');
      content = content.replace(/from "\.\/(hooks|types|utils|BudgetCards|ExpenseCard|MonthlyHistory|AddExpenseDrawer|ApproveExpenseDrawer|CreateLedgerDrawer)"/g, 'from "../$1"');
      content = content.replace(/from '\.\/(hooks|types|utils|BudgetCards|ExpenseCard|MonthlyHistory|AddExpenseDrawer|ApproveExpenseDrawer|CreateLedgerDrawer)'/g, 'from \'../$1\'');
      fs.writeFileSync(p, content);
    }
  }
}

replaceImports('./components');
replaceImports('./drawers');
