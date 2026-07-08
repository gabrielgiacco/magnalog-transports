declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, any>;
    jsPDF?: Record<string, any>;
    pagebreak?: { mode?: string | string[]; before?: string; after?: string; avoid?: string };
    enableLinks?: boolean;
  }
  interface Html2PdfInstance {
    from(el: HTMLElement | string): Html2PdfInstance;
    set(opt: Html2PdfOptions): Html2PdfInstance;
    save(): Promise<void>;
    toPdf(): Html2PdfInstance;
    output(type?: string, options?: any): Promise<any>;
  }
  function html2pdf(): Html2PdfInstance;
  export default html2pdf;
}
