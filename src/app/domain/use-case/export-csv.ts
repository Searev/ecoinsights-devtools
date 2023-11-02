import { Analysis } from "../models/analysis";
import { PageAnalysis } from "../models/page-analysis";

const CSV_MEDIA_TYPE = "text/csv";
const CSV_EXTENSION = "csv";
const DIVIDER = ";";
const NEW_LINE_DIVIDER = "\n";

interface FieldToExport {
  columnName: string;
  field?: keyof PageAnalysis;
  getter?: (el: PageAnalysis) => string;
}

const FIELDS_TO_EXPORT: FieldToExport[] = [
  { columnName: "Titre de la page", field: "title" },
  { columnName: "URL", field: "url" },
  {
    columnName: "Date",
    getter: (el) => el.navigatedAt.toLocaleDateString("fr"),
  },
  {
    columnName: "Nombre de requêtes",
    getter: (el) => String(el.requests.length),
  },
  { columnName: "Taille des requêtes (kb)", field: "requestSizeInKb" },
  { columnName: "Taille du DOM", field: "maxDomSize" },
  { columnName: "Emissions de GES (gCO2e)", field: "emissionsGES" },
  { columnName: "Consommation d'eau bleue", field: "consommationEauBleue" },
  { columnName: "Ecoindex", field: "ecoindex" },
];

export function exportAnalysisToCsv(analysis: Analysis): string {
  const header = FIELDS_TO_EXPORT.map((el) => el.columnName).join(DIVIDER);
  const rows = analysis.pages.map((page) => {
    const columns = FIELDS_TO_EXPORT.map((field) => {
      if (field.field != null) {
        return String(page[field.field] ?? "");
      }
      return field.getter != null ? field.getter(page) : "";
    });
    return columns.join(DIVIDER);
  });

  return header + NEW_LINE_DIVIDER + rows.join(NEW_LINE_DIVIDER);
}

function createDownloadTitle(analysis: Analysis) {
  return `${analysis.service.name} - ${analysis.date.toLocaleDateString(
    "fr"
  )}.${CSV_EXTENSION}`;
}

export function downloadAsCsv(analysis: Analysis) {
  const csv = exportAnalysisToCsv(analysis);

  const downloadLink = document.createElement("a");
  downloadLink.href = window.URL.createObjectURL(
    new Blob([csv], { type: CSV_MEDIA_TYPE })
  );
  downloadLink.setAttribute("download", createDownloadTitle(analysis));
  document.body.appendChild(downloadLink);
  downloadLink.click();
}
