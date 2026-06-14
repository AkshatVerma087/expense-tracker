import { Decimal } from '@prisma/client/runtime/library.js';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export async function detectAnomalies(row, index, groupMembers, existingRows, fetchExchangeRate) {
  const anomalies = [];
  
  // Standard mappings (handling casing from typical CSVs)
  let rawDate = row['Date'] || row['date'] || '';
  const description = row['Description'] || row['description'] || '';
  const rawAmount = row['Amount'] || row['amount'] || '';
  let currency = row['Currency'] || row['currency'] || '';
  let payerEmail = row['Paid By'] || row['paid_by'] || '';
  const splitType = row['Split Type'] || row['split_type'] || 'EQUAL';
  const splitWith = row['Split With'] || row['split_with'] || '';
  const splitDetails = row['Split Details'] || row['split_details'] || '';

  const parsedData = {
    rowNumber: index + 1,
    date: rawDate,
    description,
    amount: rawAmount,
    currency,
    payerEmail,
    splitType: splitType.toUpperCase(),
    splitWith,
    splitDetails,
    exchangeRate: '1.0'
  };

  // Helper to find member by fuzzy name/email
  const findMember = (identifier) => {
    if (!identifier) return null;
    const lower = identifier.toLowerCase();
    return groupMembers.find(m => m.user.email.toLowerCase() === lower || m.user.name.toLowerCase() === lower);
  };

  // A-04 & A-16: Settlements as Expenses
  const isSettlement = splitType.trim() === '' || description.toLowerCase().includes('paid back') || description.toLowerCase().includes('deposit');
  if (isSettlement) {
    anomalies.push({ code: 'A-04_16', type: 'SETTLEMENT_AS_EXPENSE', severity: 'CRITICAL', message: 'This looks like a money transfer/settlement rather than a shared expense.', options: ['Import as Settlement', 'Import as Expense'] });
  }

  // A-07: Missing Payer
  if (!payerEmail) {
    anomalies.push({ code: 'A-07', type: 'MISSING_PAYER', severity: 'CRITICAL', message: 'Paid By field is empty.', options: groupMembers.map(m => m.user.email) });
  } else {
    // A-11: Case Mismatch
    let member = findMember(payerEmail);
    if (member && member.user.email !== payerEmail) {
      // Auto-normalize
      parsedData.payerEmail = member.user.email;
    } else if (!member) {
      // A-10: Ambiguous Payer
      anomalies.push({ code: 'A-10', type: 'AMBIGUOUS_PAYER', severity: 'MEDIUM', message: `Cannot exactly match payer '${payerEmail}'.`, options: groupMembers.map(m => m.user.email) });
    }
  }

  // A-08: Missing Currency
  if (!currency) {
    anomalies.push({ code: 'A-08', type: 'MISSING_CURRENCY', severity: 'MEDIUM', message: 'Currency is empty. Defaulting to INR.', options: ['INR', 'USD'] });
    parsedData.currency = 'INR';
    currency = 'INR';
  }

  // Date Parsing (A-01 & A-15)
  if (rawDate) {
    // Basic date parsing assumption (assuming MM/DD/YYYY unless day <= 12)
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      const part1 = parseInt(parts[0], 10);
      const part2 = parseInt(parts[1], 10);
      
      if (part1 <= 12 && part2 <= 12 && part1 !== part2) {
         // A-15: Ambiguous Date
         const opt1 = `${parts[2]}-${String(part1).padStart(2, '0')}-${String(part2).padStart(2, '0')}`;
         const opt2 = `${parts[2]}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
         anomalies.push({ code: 'A-15', type: 'AMBIGUOUS_DATE', severity: 'MEDIUM', message: 'Date format is ambiguous.', options: [opt1, opt2] });
      } else if (part1 > 12) {
         // It's DD/MM/YYYY
         parsedData.date = `${parts[2]}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
      } else {
         // It's MM/DD/YYYY
         parsedData.date = `${parts[2]}-${String(part1).padStart(2, '0')}-${String(part2).padStart(2, '0')}`;
      }
    }
  } else {
    anomalies.push({ code: 'MISSING_DATE', type: 'MISSING_DATE', severity: 'CRITICAL', message: 'Date is required.' });
  }

  // A-17: Foreign Currency (USD -> INR)
  if (currency.toUpperCase() === 'USD' && parsedData.date && !anomalies.find(a => a.code === 'A-15')) {
    try {
      const rate = await fetchExchangeRate(parsedData.date);
      parsedData.exchangeRate = rate.toString();
      anomalies.push({ code: 'A-17', type: 'FOREIGN_CURRENCY', severity: 'CRITICAL', message: `USD expense requires conversion. Rate fetched: ₹${rate}.`, options: ['Accept Rate', 'Reject'] });
    } catch (e) {
      anomalies.push({ code: 'A-17', type: 'FOREIGN_CURRENCY', severity: 'CRITICAL', message: 'Failed to fetch historical exchange rate.' });
    }
  }

  // Amount parsing (A-06, A-13, A-14)
  try {
    const amountDec = new Decimal(rawAmount || '0');
    if (amountDec.isZero()) {
      anomalies.push({ code: 'A-13', type: 'ZERO_AMOUNT', severity: 'MEDIUM', message: 'Amount is zero. Skip this expense?' });
    } else if (amountDec.isNegative()) {
      anomalies.push({ code: 'A-14', type: 'NEGATIVE_AMOUNT', severity: 'MEDIUM', message: 'Amount is negative (refund).' });
    }
    
    if (amountDec.decimalPlaces() > 2) {
      anomalies.push({ code: 'A-06', type: 'SUB_PAISE_AMOUNT', severity: 'MEDIUM', message: `Sub-paise precision detected. Will round ${amountDec.toString()} to 2 decimals.` });
      parsedData.amount = amountDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
    } else {
      parsedData.amount = amountDec.toString();
    }
  } catch (e) {
    anomalies.push({ code: 'INVALID_AMOUNT', type: 'INVALID_AMOUNT', severity: 'CRITICAL', message: `Invalid amount format: ${rawAmount}` });
  }

  // A-05 & A-18: Split Type parsing
  if (parsedData.splitType === 'PERCENTAGE' && splitDetails) {
    const details = splitDetails.split(';');
    let sum = new Decimal(0);
    details.forEach(d => {
      const match = d.match(/(\d+(?:\.\d+)?)/);
      if (match) sum = sum.plus(new Decimal(match[1]));
    });
    if (!sum.equals(100)) {
      anomalies.push({ code: 'A-05', type: 'PERCENTAGE_SUM_INVALID', severity: 'CRITICAL', message: `Percentages sum to ${sum.toString()} instead of 100.` });
    }
  } else if (parsedData.splitType === 'EQUAL' && splitDetails) {
    anomalies.push({ code: 'A-18', type: 'EQUAL_WITH_SHARE_DETAILS', severity: 'LOW', message: 'Share details provided for an EQUAL split. Using EQUAL.' });
  }

  // A-09: Unknown Member in Split
  if (splitWith) {
    const participants = splitWith.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const unknown = participants.filter(p => !findMember(p));
    if (unknown.length > 0) {
      anomalies.push({ code: 'A-09', type: 'UNKNOWN_MEMBER_IN_SPLIT', severity: 'MEDIUM', message: `Participants ${unknown.join(', ')} are not group members.` });
    }
  }

  // A-02 & A-03: Duplicates
  const exactDupe = existingRows.find(r => r.date === parsedData.date && r.amount === parsedData.amount && r.payerEmail === parsedData.payerEmail);
  if (exactDupe) {
    if (exactDupe.description.toLowerCase() === parsedData.description.toLowerCase()) {
      anomalies.push({ code: 'A-02', type: 'DUPLICATE_EXACT', severity: 'CRITICAL', message: 'Exact duplicate expense detected.' });
    } else {
      anomalies.push({ code: 'A-03', type: 'DUPLICATE_CONFLICTING', severity: 'CRITICAL', message: 'Conflicting duplicate expense detected (same amount/date/payer, different description).' });
    }
  }

  return { parsedData, anomalies };
}
