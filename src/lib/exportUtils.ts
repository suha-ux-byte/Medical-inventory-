import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportRowsToCsv(filename: string, columns: string[], rows: Array<Record<string, unknown>>): void {
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const data = rows.map((row) => {
    const out: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const key = keys[i];
      out[col] = key ? row[key] ?? '' : '';
    });
    return out;
  });

  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportRowsToPdf(
  filename: string,
  title: string,
  subtitle: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
): void {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(`MediStock — ${title}`, 40, 32);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString()}`, 40, 48);

  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const body = rows.map((row) => keys.map((k) => String(row[k] ?? '—')));

  autoTable(doc, {
    startY: 82,
    head: [columns],
    body,
    styles: { fontSize: 8.5, cellPadding: 6, textColor: [30, 41, 59] },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export async function parseSpreadsheetFile(file: File): Promise<Array<Record<string, string>>> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return parsed.data;
  }

  if (lower.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headers: string[] = [];
    const results: Array<Record<string, string>> = [];
    sheet.eachRow((row, rowNumber) => {
      const values = row.values as Array<unknown>;
      if (rowNumber === 1) {
        for (let c = 1; c < values.length; c++) {
          headers.push(String(values[c] ?? `col_${c}`).trim());
        }
        return;
      }
      const obj: Record<string, string> = {};
      let hasValue = false;
      for (let c = 1; c <= headers.length; c++) {
        const raw = values[c];
        const cellText =
          raw instanceof Date
            ? raw.toISOString().slice(0, 10)
            : typeof raw === 'object' && raw !== null && 'text' in raw
              ? String((raw as { text: unknown }).text)
              : String(raw ?? '').trim();
        if (cellText) hasValue = true;
        obj[headers[c - 1]] = cellText;
      }
      if (hasValue) results.push(obj);
    });
    return results;
  }

  throw new Error('Unsupported file format. Please upload a .csv or .xlsx spreadsheet.');
}

export async function downloadSampleInventoryTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventory Import');
  sheet.addRow([
    'itemCode',
    'name',
    'category',
    'brand',
    'batchNumber',
    'quantityAvailable',
    'unitOfMeasure',
    'purchaseDate',
    'manufacturingDate',
    'expiryDate',
    'supplierName',
    'storageLocation',
    'unitPrice',
    'reorderLevel',
  ]);
  sheet.addRow([
    'MED-9001',
    'Ciprofloxacin 500mg Tablets',
    'Tablets',
    'BayerCare',
    'CIP-2026A',
    120,
    'Boxes (50 tabs)',
    '2026-10-01',
    '2026-06-15',
    '2027-08-30',
    'McKesson Medical-Surgical',
    'Pharmacy Shelf A-04',
    24.5,
    30,
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'medistock_inventory_template.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
