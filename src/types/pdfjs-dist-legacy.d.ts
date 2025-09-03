declare module 'pdfjs-dist/legacy/build/pdf' {
  export const GlobalWorkerOptions: any;
  export function getDocument(src: any): { promise: Promise<any> };
}
