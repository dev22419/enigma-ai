export type ParsedFile =
  | { kind: "text"; text: string }
  | { kind: "image"; base64: string; mimeType: string };

const PDF_EXT = /\.pdf$/i;
const DOCX_EXT = /\.docx$/i;
const XLS_EXT = /\.xlsx?$/i;

export function canParse(name: string): boolean {
  return PDF_EXT.test(name) || DOCX_EXT.test(name) || XLS_EXT.test(name);
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  if (PDF_EXT.test(name)) return parsePdf(file);
  if (DOCX_EXT.test(name)) return parseDocx(file);
  if (XLS_EXT.test(name)) return parseXlsx(file);
  throw new Error(`Unsupported file type: ${name}`);
}

async function parsePdf(file: File): Promise<ParsedFile> {
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    if (text.trim()) pages.push(text.trim());
  }
  if (pages.join("").trim().length === 0) {
    return renderPdfPageAsImage(doc);
  }
  return { kind: "text", text: pages.join("\n\n") };
}

async function renderPdfPageAsImage(
  doc: Awaited<ReturnType<typeof import("pdfjs-dist")["getDocument"]>["promise"]>,
): Promise<ParsedFile> {
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.replace(/^data:[^,]*,/, "");
  return { kind: "image", base64, mimeType: "image/png" };
}

async function parseDocx(file: File): Promise<ParsedFile> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  if (!result.value.trim()) throw new Error("The document appears to be empty.");
  return { kind: "text", text: result.value };
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) sheets.push(`--- ${name} ---\n${csv.trim()}`);
  }
  if (sheets.length === 0) throw new Error("The spreadsheet appears to be empty.");
  return { kind: "text", text: sheets.join("\n\n") };
}
