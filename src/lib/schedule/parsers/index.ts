// Format auto-detection + unified parse() entry point.
import type { Schedule } from "../types";
import { parseXER }    from "./xer";
import { parseP6XML }  from "./p6xml";
import { parseMSPXML } from "./mspxml";

export type DetectedFormat = "P6_XER" | "P6_XML" | "MSP_XML" | "UNKNOWN";

export function detectFormat(text: string, fileName: string): DetectedFormat {
  const head = text.slice(0, 4096).trim();
  const ext  = fileName.toLowerCase().split(".").pop();

  // XER signature: starts with "ERMHDR" tab-delimited header
  if (head.startsWith("ERMHDR") || ext === "xer") return "P6_XER";

  // XML — look at root element
  if (head.startsWith("<?xml") || head.startsWith("<")) {
    if (/<APIBusinessObjects[\s>]/.test(head) || head.includes("Primavera")) return "P6_XML";
    if (/<Project[\s>]/.test(head) && head.includes("schemas.microsoft.com/project")) return "MSP_XML";
    if (/<Project[\s>]/.test(head)) return "MSP_XML";
  }

  return "UNKNOWN";
}

export async function parseSchedule(file: File): Promise<Schedule> {
  const text = await file.text();
  const fmt  = detectFormat(text, file.name);

  switch (fmt) {
    case "P6_XER": return parseXER(text, file.name);
    case "P6_XML": return parseP6XML(text, file.name);
    case "MSP_XML":return parseMSPXML(text, file.name);
    default:
      throw new Error(
        `Unrecognised file format. Supported: Primavera XER (.xer), Primavera P6 XML, Microsoft Project XML. ` +
        `Note: native .mpp files must be exported to XML from MS Project first (File → Export → XML).`,
      );
  }
}
