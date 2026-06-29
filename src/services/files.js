const path = require("path");
const fs = require("fs");
const db = require("./db");
const knowledge = require("./knowledge");

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const EXT_TO_TYPE = {
  ".pdf": "pdf",
  ".doc": "word",
  ".docx": "word",
  ".xls": "excel",
  ".xlsx": "excel",
  ".csv": "excel",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".vcf": "vcf",
};

const TYPE_LABEL = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  image: "Imagen",
  vcf: "Contacto VCF",
};

function detectFileType(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  return EXT_TO_TYPE[ext] || null;
}

function isAllowedFile(originalName) {
  return detectFileType(originalName) !== null;
}

async function extractPdfText(filePath) {
  const { PDFParse } = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return (result.text || "").trim();
}

async function extractWordText(filePath) {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return (result.value || "").trim();
}

async function extractExcelText(filePath) {
  const xlsx = require("xlsx");
  const workbook = xlsx.readFile(filePath);
  const parts = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`--- ${sheetName} ---\n${csv.trim()}`);
  });
  return parts.join("\n\n").trim();
}

async function extractImageText(filePath) {
  const Tesseract = require("tesseract.js");
  const { data } = await Tesseract.recognize(filePath, "spa+eng");
  return (data.text || "").trim();
}

function extractVcfText(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const cards = raw.split(/BEGIN:VCARD/i).slice(1);
  const summaries = cards.map((card) => {
    const fn = (card.match(/FN:(.*)/i) || [])[1];
    const tels = [...card.matchAll(/TEL[^:]*:(.*)/gi)].map((m) => m[1].trim());
    const emails = [...card.matchAll(/EMAIL[^:]*:(.*)/gi)].map((m) => m[1].trim());
    const org = (card.match(/ORG:(.*)/i) || [])[1];
    const lines = [];
    if (fn) lines.push(`Nombre: ${fn.trim()}`);
    if (org) lines.push(`Organización: ${org.trim()}`);
    if (tels.length) lines.push(`Teléfono(s): ${tels.join(", ")}`);
    if (emails.length) lines.push(`Email(s): ${emails.join(", ")}`);
    return lines.join("\n");
  });
  return summaries.filter(Boolean).join("\n\n").trim();
}

async function extractText(fileType, filePath) {
  switch (fileType) {
    case "pdf":
      return extractPdfText(filePath);
    case "word":
      return extractWordText(filePath);
    case "excel":
      return extractExcelText(filePath);
    case "image":
      return extractImageText(filePath);
    case "vcf":
      return extractVcfText(filePath);
    default:
      return "";
  }
}

async function processUploadedFile({ originalName, storedName, mimeType, size }) {
  const fileType = detectFileType(originalName);
  const record = db.createImportedFile({ originalName, storedName, mimeType, fileType, size });
  const filePath = path.join(uploadsDir, storedName);

  try {
    const text = await extractText(fileType, filePath);
    const note = knowledge.createNote({
      title: originalName,
      content: text || "(No se pudo extraer texto de este archivo)",
      tags: ["importado", fileType],
      source: "auto",
    });
    db.updateImportedFile(record.id, {
      extractedText: text,
      noteId: note.id,
      status: "done",
    });
  } catch (err) {
    console.error("Error procesando archivo importado:", err);
    db.updateImportedFile(record.id, {
      status: "error",
      errorMessage: err.message || "Error desconocido",
    });
  }

  return db.getImportedFile(record.id);
}

function getAllFiles() {
  return db.getAllImportedFiles();
}

function getFile(id) {
  return db.getImportedFile(id);
}

function deleteFile(id) {
  const file = db.getImportedFile(id);
  if (!file) return;
  const filePath = path.join(uploadsDir, file.stored_name);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Error borrando archivo físico:", err);
    }
  }
  db.deleteImportedFile(id);
}

module.exports = {
  uploadsDir,
  isAllowedFile,
  detectFileType,
  TYPE_LABEL,
  processUploadedFile,
  getAllFiles,
  getFile,
  deleteFile,
};
