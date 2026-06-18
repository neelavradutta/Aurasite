import { jsPDF } from 'jspdf';
import { Vehicle, VehicleDetectionSummary } from '@/types/vehicle';
import { displayValue } from '@/utils/detectionDisplay';
import { getStatusLabel, getVehicleStatus } from '@/utils/vehicleStatus';
import { isUnreadablePlate } from '@/utils/dashboardDetections';
import { getDetectionSnapshotUrl } from '@/services/api';

const PAGE_W = 595.28;
const CONTENT_X = 53;
const CONTENT_W = 490;
const SNAPSHOT_W = 132;
const SNAPSHOT_H = 84;
const SNAPSHOT_X = CONTENT_X + CONTENT_W - SNAPSHOT_W;
const SNAPSHOT_Y = 48;
const CONTENT_START_Y = SNAPSHOT_Y + SNAPSHOT_H + 22;
const SECTION_TITLE_X = 95;
const LICENSE_STATUS_DIV = 244.8;

const GRID_PAD = 6;

type GridLayout = {
  colDiv1: number;
  colDiv2: number;
  colDiv3: number;
  labelX: number;
  valueLX: number;
  labelRX: number;
  valueRX: number;
  valueLW: number;
  valueRW: number;
  labelLW: number;
  labelRW: number;
};

function buildGridLayout(labelCol1W: number, labelCol3W: number): GridLayout {
  const valueCol1W = Math.floor((CONTENT_W - labelCol1W - labelCol3W) / 2);
  const valueCol2W = CONTENT_W - labelCol1W - valueCol1W - labelCol3W;
  const colDiv1 = CONTENT_X + labelCol1W;
  const colDiv2 = colDiv1 + valueCol1W;
  const colDiv3 = colDiv2 + labelCol3W;
  const labelX = CONTENT_X + GRID_PAD;
  const valueLX = colDiv1 + GRID_PAD;
  const labelRX = colDiv2 + GRID_PAD;
  const valueRX = colDiv3 + GRID_PAD;

  return {
    colDiv1,
    colDiv2,
    colDiv3,
    labelX,
    valueLX,
    labelRX,
    valueRX,
    valueLW: colDiv2 - valueLX - GRID_PAD,
    valueRW: CONTENT_X + CONTENT_W - valueRX - GRID_PAD,
    labelLW: colDiv1 - labelX - GRID_PAD,
    labelRW: colDiv3 - labelRX - GRID_PAD,
  };
}

const OWNER_GRID = buildGridLayout(72, 62);
const VEHICLE_GRID = buildGridLayout(96, 96);
const TIMELINE_DIV_1 = 205;
const TIMELINE_DIV_2 = 368;
const TIMELINE_COL1_W = TIMELINE_DIV_1 - SECTION_TITLE_X - GRID_PAD;
const TIMELINE_COL2_W = TIMELINE_DIV_2 - TIMELINE_DIV_1 - GRID_PAD;
const TIMELINE_COL3_W = CONTENT_X + CONTENT_W - TIMELINE_DIV_2 - GRID_PAD;
const PAGE_BOTTOM = 780;
const CONTINUATION_Y = 53;

const NAVY: [number, number, number] = [26, 35, 126];
const RED: [number, number, number] = [211, 47, 47];
const GRAY_HEADER: [number, number, number] = [245, 245, 245];
const ROW_ALT: [number, number, number] = [250, 250, 250];
const LABEL_COLOR: [number, number, number] = [33, 33, 33];
const VALUE_COLOR: [number, number, number] = [102, 102, 102];
const FOOTER_COLOR: [number, number, number] = [153, 153, 153];
const STATUS_NOTES_BG: [number, number, number] = [255, 235, 238];

const STATUS_COLOR: Record<string, [number, number, number]> = {
  active: [46, 125, 50],
  suspicious: RED,
  invalid: [97, 97, 97],
  accidental: [245, 124, 0],
};

function formatTimelineTimestamp(value?: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReportGeneratedAt(): string {
  return new Date().toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getReportFilename(plate: string): string {
  const normalized = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `Vehicle_Report_${normalized || 'UNKNOWN'}.pdf`;
}

function sortTimeline(detections?: VehicleDetectionSummary[]): VehicleDetectionSummary[] {
  if (!detections?.length) return [];
  return [...detections].sort((a, b) => {
    const left = new Date(a.detection_timestamp || 0).getTime();
    const right = new Date(b.detection_timestamp || 0).getTime();
    return right - left;
  });
}

async function loadImageAsDataUrl(url: string): Promise<{ data: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return data ? { data, format } : null;
  } catch {
    return null;
  }
}

function drawSnapshotTopRight(doc: jsPDF, image: { data: string; format: 'JPEG' | 'PNG' } | null) {
  const pad = 2;

  if (image) {
    doc.addImage(
      image.data,
      image.format,
      SNAPSHOT_X + pad,
      SNAPSHOT_Y + pad,
      SNAPSHOT_W - pad * 2,
      SNAPSHOT_H - pad * 2,
    );
  } else {
    doc.setFillColor(250, 250, 250);
    doc.rect(SNAPSHOT_X, SNAPSHOT_Y, SNAPSHOT_W, SNAPSHOT_H, 'F');
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.rect(SNAPSHOT_X, SNAPSHOT_Y, SNAPSHOT_W, SNAPSHOT_H, 'S');

  if (!image) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...VALUE_COLOR);
    doc.text(
      'Not available',
      SNAPSHOT_X + SNAPSHOT_W / 2,
      SNAPSHOT_Y + SNAPSHOT_H / 2 + 3,
      { align: 'center', baseline: 'middle' },
    );
  }
}

function getTimelineLocation(vehicle: Vehicle): string {
  const code = vehicle.recent_location?.camera_code?.trim();
  if (code) return code;
  const name = vehicle.recent_location?.camera_name?.trim();
  if (name) return name;
  return '--';
}

function drawLabel(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...LABEL_COLOR);
  doc.text(text, x, y);
}

function drawNavyBarHeader(doc: jsPDF, y: number, title: string) {
  doc.setFillColor(...NAVY);
  doc.rect(CONTENT_X, y, CONTENT_W, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title, SECTION_TITLE_X, y + 13);
}

const VALUE_LINE_H = 14;
const LABEL_LINE_H = 11;
const ROW_PAD_TOP = 9;
const ROW_PAD_BOTTOM = 6;

function splitValueLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text || '--', maxWidth);
  return lines.length ? lines : ['--'];
}

function splitLabelLines(doc: jsPDF, label: string, maxWidth: number): string[] {
  if (label.includes('\n')) {
    return label.split('\n');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(label, maxWidth);
  return lines.length ? lines : [label];
}

function lineBlockHeight(lineCount: number, lineHeight: number): number {
  return Math.max(lineCount, 1) * lineHeight;
}

function drawWrappedLabels(doc: jsPDF, lines: string[], x: number, y: number) {
  lines.forEach((line, index) => {
    drawLabel(doc, line, x, y + index * LABEL_LINE_H);
  });
}

function drawWrappedValues(doc: jsPDF, lines: string[], x: number, y: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...VALUE_COLOR);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * VALUE_LINE_H);
  });
}

function ensurePageSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) return y;
  doc.addPage();
  return CONTINUATION_Y;
}

function closeTableBorder(doc: jsPDF, topY: number, bottomY: number) {
  if (bottomY <= topY) return;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.6);
  doc.rect(CONTENT_X, topY, CONTENT_W, bottomY - topY, 'S');
}

function closeSectionBorder(doc: jsPDF, topY: number, tableY: number, bottomY: number) {
  if (bottomY <= topY) return;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.6);
  doc.rect(CONTENT_X, topY, CONTENT_W, bottomY - topY, 'S');
  doc.line(CONTENT_X, tableY, CONTENT_X + CONTENT_W, tableY);
}

function measureGridRowHeight(
  doc: jsPDF,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  cols: GridLayout,
): number {
  const leftLabelLines = splitLabelLines(doc, leftLabel, cols.labelLW);
  const rightLabelLines = splitLabelLines(doc, rightLabel, cols.labelRW);
  const leftValueLines = splitValueLines(doc, leftValue, cols.valueLW);
  const rightValueLines = splitValueLines(doc, rightValue, cols.valueRW);

  const leftH = Math.max(lineBlockHeight(leftLabelLines.length, LABEL_LINE_H), lineBlockHeight(leftValueLines.length, VALUE_LINE_H));
  const rightH = Math.max(lineBlockHeight(rightLabelLines.length, LABEL_LINE_H), lineBlockHeight(rightValueLines.length, VALUE_LINE_H));

  return Math.max(leftH, rightH, 18) + ROW_PAD_TOP + ROW_PAD_BOTTOM;
}

function measureSplitLabelRowHeight(
  doc: jsPDF,
  leftValue: string,
  rightValue: string,
  cols: GridLayout,
): number {
  const leftValueLines = splitValueLines(doc, leftValue, cols.valueLW);
  const rightValueLines = splitValueLines(doc, rightValue, cols.valueRW);
  const leftH = Math.max(LABEL_LINE_H * 2, lineBlockHeight(leftValueLines.length, VALUE_LINE_H));
  const rightH = Math.max(LABEL_LINE_H * 2, lineBlockHeight(rightValueLines.length, VALUE_LINE_H));
  return Math.max(leftH, rightH, 18) + ROW_PAD_TOP + ROW_PAD_BOTTOM;
}

function drawGridRowSplitValues(
  doc: jsPDF,
  y: number,
  height: number,
  fill: [number, number, number],
  leftValue: string,
  rightValue: string,
  cols: GridLayout,
) {
  const textY = y + ROW_PAD_TOP + 8;
  const labelLine2Y = textY + LABEL_LINE_H;

  doc.setFillColor(...fill);
  doc.rect(CONTENT_X, y, CONTENT_W, height, 'F');

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(cols.colDiv1, y, cols.colDiv1, y + height);
  doc.line(cols.colDiv2, y, cols.colDiv2, y + height);
  doc.line(cols.colDiv3, y, cols.colDiv3, y + height);
  doc.line(CONTENT_X, y + height, CONTENT_X + CONTENT_W, y + height);

  drawLabel(doc, 'RESIDENTIAL', cols.labelX, textY);
  drawLabel(doc, 'DRIVING', cols.labelRX, textY);
  drawLabel(doc, 'ADDRESS', cols.labelX, labelLine2Y);
  drawLabel(doc, 'LICENSE', cols.labelRX, labelLine2Y);

  drawWrappedValues(doc, splitValueLines(doc, leftValue, cols.valueLW), cols.valueLX, textY);
  drawWrappedValues(doc, splitValueLines(doc, rightValue, cols.valueRW), cols.valueRX, textY);
}

function drawGridRow(
  doc: jsPDF,
  y: number,
  height: number,
  fill: [number, number, number],
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  cols: GridLayout,
) {
  const textY = y + ROW_PAD_TOP + 8;

  doc.setFillColor(...fill);
  doc.rect(CONTENT_X, y, CONTENT_W, height, 'F');

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(cols.colDiv1, y, cols.colDiv1, y + height);
  doc.line(cols.colDiv2, y, cols.colDiv2, y + height);
  doc.line(cols.colDiv3, y, cols.colDiv3, y + height);
  doc.line(CONTENT_X, y + height, CONTENT_X + CONTENT_W, y + height);

  splitLabelLines(doc, leftLabel, cols.labelLW).forEach((line, index) => {
    drawLabel(doc, line, cols.labelX, textY + index * LABEL_LINE_H);
  });

  drawWrappedValues(doc, splitValueLines(doc, leftValue, cols.valueLW), cols.valueLX, textY);

  if (rightLabel) {
    splitLabelLines(doc, rightLabel, cols.labelRW).forEach((line, index) => {
      drawLabel(doc, line, cols.labelRX, textY + index * LABEL_LINE_H);
    });

    drawWrappedValues(doc, splitValueLines(doc, rightValue, cols.valueRW), cols.valueRX, textY);
  }
}

function drawOwnerProfileSection(doc: jsPDF, y: number, vehicle: Vehicle): number {
  const rows: Array<{
    fill: [number, number, number];
    ll: string;
    lv: string;
    rl: string;
    rv: string;
    split?: boolean;
  }> = [
    { fill: [255, 255, 255], ll: 'NAME', lv: displayValue(vehicle.owner_name), rl: 'CONTACT', rv: displayValue(vehicle.owner_contact) },
    { fill: ROW_ALT, ll: 'EMAIL', lv: displayValue(vehicle.owner_email), rl: 'WORK', rv: displayValue(vehicle.work) },
    {
      fill: [255, 255, 255],
      ll: 'RESIDENTIAL ADDRESS',
      lv: displayValue(vehicle.owner_address),
      rl: 'DRIVING LICENSE',
      rv: displayValue(vehicle.driving_license),
      split: true,
    },
  ];

  y = ensurePageSpace(doc, y, 36);
  let sectionTop = y;
  drawNavyBarHeader(doc, y, 'OWNER PROFILE');
  let tableY = y + 18;
  let rowY = tableY;

  for (const row of rows) {
    const rowH = row.split
      ? measureSplitLabelRowHeight(doc, row.lv, row.rv, OWNER_GRID)
      : measureGridRowHeight(doc, row.ll, row.lv, row.rl, row.rv, OWNER_GRID);

    if (rowY + rowH > PAGE_BOTTOM) {
      closeSectionBorder(doc, sectionTop, tableY, rowY);
      doc.addPage();
      y = CONTINUATION_Y;
      sectionTop = y;
      drawNavyBarHeader(doc, y, 'OWNER PROFILE');
      tableY = y + 18;
      rowY = tableY;
    }

    if (row.split) {
      drawGridRowSplitValues(doc, rowY, rowH, row.fill, row.lv, row.rv, OWNER_GRID);
    } else {
      drawGridRow(doc, rowY, rowH, row.fill, row.ll, row.lv, row.rl, row.rv, OWNER_GRID);
    }

    rowY += rowH;
  }

  closeSectionBorder(doc, sectionTop, tableY, rowY);
  return rowY + 14;
}

function drawVehicleInformationSection(doc: jsPDF, y: number, vehicle: Vehicle): number {
  const vehicleRows: Array<[string, string, string, string]> = [
    ['TYPE', displayValue(vehicle.vehicle_type), 'COLOR', displayValue(vehicle.color)],
    ['MODEL', displayValue(vehicle.model), 'YEAR', displayValue(vehicle.manufacturing_year)],
    ['FUEL TYPE', displayValue(vehicle.fuel_type), 'MODIFICATIONS', displayValue(vehicle.modifications)],
    ['ENGINE NUMBER', displayValue(vehicle.engine_number), 'CHASSIS NUMBER', displayValue(vehicle.chassis_number)],
  ];

  y = ensurePageSpace(doc, y, 36);
  let sectionTop = y;
  drawNavyBarHeader(doc, y, 'VEHICLE INFORMATION');
  let tableY = y + 18;
  let rowY = tableY;

  vehicleRows.forEach(([ll, lv, rl, rv], index) => {
    const rowH = measureGridRowHeight(doc, ll, lv, rl, rv, VEHICLE_GRID);

    if (rowY + rowH > PAGE_BOTTOM) {
      closeSectionBorder(doc, sectionTop, tableY, rowY);
      doc.addPage();
      y = CONTINUATION_Y;
      sectionTop = y;
      drawNavyBarHeader(doc, y, 'VEHICLE INFORMATION');
      tableY = y + 18;
      rowY = tableY;
    }

    drawGridRow(doc, rowY, rowH, index % 2 === 0 ? [255, 255, 255] : ROW_ALT, ll, lv, rl, rv, VEHICLE_GRID);
    rowY += rowH;
  });

  closeSectionBorder(doc, sectionTop, tableY, rowY);
  return rowY + 14;
}

function drawLicensePlateSection(doc: jsPDF, y: number, plate: string, statusLabel: string, statusColor: [number, number, number]) {
  const statusCenterX = LICENSE_STATUS_DIV + (CONTENT_X + CONTENT_W - LICENSE_STATUS_DIV) / 2;

  doc.setFillColor(...GRAY_HEADER);
  doc.rect(CONTENT_X, y, CONTENT_W, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('LICENSE PLATE', SECTION_TITLE_X, y + 13);
  doc.text('STATUS', statusCenterX, y + 13, { align: 'center' });

  const contentY = y + 18;
  doc.setFillColor(255, 255, 255);
  doc.rect(CONTENT_X, contentY, CONTENT_W, 24, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.6);
  doc.rect(CONTENT_X, y, CONTENT_W, 42, 'S');
  doc.line(CONTENT_X, contentY, CONTENT_X + CONTENT_W, contentY);
  doc.line(LICENSE_STATUS_DIV, contentY, LICENSE_STATUS_DIV, contentY + 24);

  const rowCenter = contentY + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(plate, SECTION_TITLE_X, rowCenter + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...statusColor);
  doc.text(statusLabel.toUpperCase(), statusCenterX, rowCenter + 5, { align: 'center' });
}

function measureTimelineRowHeight(
  doc: jsPDF,
  dateText: string,
  sourceText: string,
  locationText: string,
): number {
  const dateLines = splitValueLines(doc, dateText, TIMELINE_COL1_W).length;
  const sourceLines = splitValueLines(doc, sourceText, TIMELINE_COL2_W).length;
  const locationLines = splitValueLines(doc, locationText, TIMELINE_COL3_W).length;
  return Math.max(lineBlockHeight(dateLines, VALUE_LINE_H), lineBlockHeight(sourceLines, VALUE_LINE_H), lineBlockHeight(locationLines, VALUE_LINE_H), 18)
    + ROW_PAD_TOP + ROW_PAD_BOTTOM;
}

function drawTimelineColumnHeader(doc: jsPDF, tableY: number) {
  doc.setFillColor(255, 255, 255);
  doc.rect(CONTENT_X, tableY, CONTENT_W, 18, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.line(TIMELINE_DIV_1, tableY, TIMELINE_DIV_1, tableY + 18);
  doc.line(TIMELINE_DIV_2, tableY, TIMELINE_DIV_2, tableY + 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...LABEL_COLOR);
  doc.text('DATE & TIME', SECTION_TITLE_X, tableY + 12);
  doc.text('SOURCE', TIMELINE_DIV_1 + GRID_PAD, tableY + 12);
  doc.text('LOCATION', TIMELINE_DIV_2 + GRID_PAD, tableY + 12);
  doc.setLineWidth(0.6);
  doc.rect(CONTENT_X, tableY, CONTENT_W, 18, 'S');
}

function drawTimelineDataRow(
  doc: jsPDF,
  rowY: number,
  rowH: number,
  dateText: string,
  sourceText: string,
  locationText: string,
  emptyMessage = false,
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(CONTENT_X, rowY, CONTENT_W, rowH, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.line(TIMELINE_DIV_1, rowY, TIMELINE_DIV_1, rowY + rowH);
  doc.line(TIMELINE_DIV_2, rowY, TIMELINE_DIV_2, rowY + rowH);
  doc.line(CONTENT_X, rowY + rowH, CONTENT_X + CONTENT_W, rowY + rowH);

  const textY = rowY + ROW_PAD_TOP + 8;

  if (emptyMessage) {
    drawWrappedValues(doc, splitValueLines(doc, dateText, CONTENT_W - SECTION_TITLE_X + CONTENT_X - GRID_PAD), SECTION_TITLE_X, textY);
    return;
  }

  drawWrappedValues(doc, splitValueLines(doc, dateText, TIMELINE_COL1_W), SECTION_TITLE_X, textY);
  drawWrappedValues(doc, splitValueLines(doc, sourceText, TIMELINE_COL2_W), TIMELINE_DIV_1 + GRID_PAD, textY);
  drawWrappedValues(doc, splitValueLines(doc, locationText, TIMELINE_COL3_W), TIMELINE_DIV_2 + GRID_PAD, textY);
}

function drawTimelineSection(
  doc: jsPDF,
  y: number,
  timeline: VehicleDetectionSummary[],
  location: string,
): number {
  y = ensurePageSpace(doc, y, 54);
  let sectionTop = y;
  drawNavyBarHeader(doc, y, 'DETECTION TIMELINE');
  let tableStartY = y + 18;
  drawTimelineColumnHeader(doc, tableStartY);
  let rowY = tableStartY + 18;

  const rows = timeline.length ? timeline : [null];

  for (const item of rows) {
    const dateText = item ? formatTimelineTimestamp(item.detection_timestamp) : 'No detection history available yet.';
    const sourceText = item ? displayValue(item.video_source, 'Detection recorded') : '';
    const locationText = item ? location : '';
    const rowH = item
      ? measureTimelineRowHeight(doc, dateText, sourceText, locationText)
      : 18 + ROW_PAD_TOP + ROW_PAD_BOTTOM;

    if (rowY + rowH > PAGE_BOTTOM) {
      closeTableBorder(doc, tableStartY, rowY);
      doc.addPage();
      y = CONTINUATION_Y;
      sectionTop = y;
      drawNavyBarHeader(doc, y, 'DETECTION TIMELINE');
      tableStartY = y + 18;
      drawTimelineColumnHeader(doc, tableStartY);
      rowY = tableStartY + 18;
    }

    if (item) {
      drawTimelineDataRow(doc, rowY, rowH, dateText, sourceText, locationText);
    } else {
      drawTimelineDataRow(doc, rowY, rowH, dateText, sourceText, locationText, true);
    }

    rowY += rowH;
  }

  closeTableBorder(doc, tableStartY, rowY);
  return rowY;
}

function drawStatusNotesSection(doc: jsPDF, y: number, note: string, accent: [number, number, number]): number {
  const noteLines = splitValueLines(doc, note, CONTENT_W - (SECTION_TITLE_X - CONTENT_X) - GRID_PAD);
  const boxHeight = Math.max(33, 24 + lineBlockHeight(noteLines.length, VALUE_LINE_H));
  y = ensurePageSpace(doc, y, boxHeight);

  doc.setFillColor(...STATUS_NOTES_BG);
  doc.rect(CONTENT_X, y, CONTENT_W, boxHeight, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.6);
  doc.rect(CONTENT_X, y, CONTENT_W, boxHeight, 'S');

  doc.setFillColor(...accent);
  doc.rect(CONTENT_X, y, CONTENT_W, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...accent);
  doc.text('STATUS NOTES', SECTION_TITLE_X, y + 16);

  drawWrappedValues(doc, noteLines, SECTION_TITLE_X, y + 28);

  return y + boxHeight;
}

export async function downloadVehicleReportPdf(vehicle: Vehicle, filename?: string): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const status = getVehicleStatus(vehicle);
  const statusLabel = getStatusLabel(status);
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR.active;
  const timeline = sortTimeline(vehicle.detections);
  const latestDetection = timeline[0];
  const location = getTimelineLocation(vehicle);
  const unreadable = isUnreadablePlate(vehicle.plate_number);

  let snapshotImage: { data: string; format: 'JPEG' | 'PNG' } | null = null;
  if (latestDetection?.frame_image_path) {
    snapshotImage = await loadImageAsDataUrl(getDetectionSnapshotUrl(latestDetection.id));
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('VEHICLE DETECTION', 89, 63);
  doc.text('REPORT', 89, 81);
  drawSnapshotTopRight(doc, snapshotImage);

  let y = CONTENT_START_Y;
  drawLicensePlateSection(doc, y, vehicle.plate_number, unreadable ? 'UNKNOWN' : statusLabel, statusColor);
  y += 52;

  if (!unreadable) {
    y = drawOwnerProfileSection(doc, y, vehicle);
    y = drawVehicleInformationSection(doc, y, vehicle);
  }

  y = drawTimelineSection(doc, y, timeline, location);
  y += 14;

  const statusNote =
    vehicle.flagged_reason?.trim() ||
    (status !== 'active' ? `${statusLabel} status set by Authority` : '');

  if (statusNote) {
    y = drawStatusNotesSection(doc, y, statusNote, statusColor);
  }

  y = ensurePageSpace(doc, y, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...FOOTER_COLOR);
  doc.text(
    `Report Generated: ${formatReportGeneratedAt()} | Confidential - For Official Use Only`,
    PAGE_W / 2,
    y + 12,
    { align: 'center' },
  );

  doc.save(filename || getReportFilename(vehicle.plate_number));
}
