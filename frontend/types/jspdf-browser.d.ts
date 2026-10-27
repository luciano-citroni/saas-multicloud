declare module 'jspdf/dist/jspdf.es.min.js' {
    export class jsPDF {
        constructor(options?: object);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    }

    const _default: { jsPDF: typeof jsPDF };
    export default _default;
}

declare module 'jspdf-autotable/es' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autoTable: (doc: any, options: object) => void;
    export default autoTable;
}
