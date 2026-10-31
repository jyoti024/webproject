import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { VIEWS, makeNameOf, cellLines } from './timetableUtils.js';
import { subjectHue, hslToRgb } from './colors.js';

// One landscape A4 page per entity (class / teacher / room), subjects colour-coded.
export function exportTimetablePdf(data, type, entities, filename) {
  if (!entities.length) return;
  const view = VIEWS[type];
  const nameOf = makeNameOf(data);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  entities.forEach((entity, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(16);
    doc.text(`${view.label} Timetable: ${entity.name}`, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 22);
    doc.setTextColor(0);

    const head = [['Day', ...data.config.periods.map((p) => `P${p.no}\n${p.time}`)]];
    const body = data.config.days.map((day) => [
      day,
      ...data.config.periods.map((p) => {
        const s = data.slots.find((x) => x.day === day && x.period === p.no && x[view.key] === entity.id);
        if (!s) return '';
        return {
          content: cellLines(s, type, nameOf).join('\n'),
          styles: { fillColor: hslToRgb(subjectHue(data, s.subjectId), 80, 90) },
        };
      }),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 27,
      theme: 'grid',
      styles: { fontSize: 8, halign: 'center', valign: 'middle', cellPadding: 2, minCellHeight: 16 },
      headStyles: { fillColor: [108, 92, 231], textColor: 255 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 24 } },
    });
  });

  doc.save(filename);
}
