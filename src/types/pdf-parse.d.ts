declare module 'pdf-parse' {
  export interface PdfParseResult {
    text: string;
    numpages?: number;
    numrender?: number;
    info?: any;
    metadata?: any;
    version?: string;
  }

  export interface PdfParseOptions {
    pagerender?: (pageData: any) => Promise<string>;
    max?: number;
    version?: string;
    // allow unknown options
    [key: string]: any;
  }

  function pdfParse(
    data: Buffer | Uint8Array | ArrayBuffer,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
