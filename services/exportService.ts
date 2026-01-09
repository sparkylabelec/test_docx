
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, LevelFormat } from "docx";
import { ContentBlock } from "../types";

const getFileBuffer = async (url: string): Promise<Uint8Array | null> => {
  try {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } else {
      const response = await fetch(url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  } catch (e) {
    console.error("Failed to fetch file buffer:", e);
    return null;
  }
};

/**
 * Recursively parses HTML nodes into docx TextRuns or ImageRuns.
 */
const parseNodeContent = async (element: HTMLElement): Promise<(TextRun | ImageRun)[]> => {
  const children: (TextRun | ImageRun)[] = [];

  const walk = async (node: Node, styles: { bold?: boolean; italics?: boolean; underline?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        children.push(new TextRun({
          text: node.textContent,
          bold: styles.bold,
          italics: styles.italics,
          underline: styles.underline ? {} : undefined,
        }));
      }
    } else if (node instanceof HTMLElement) {
      const tagName = node.tagName.toUpperCase();
      
      if (tagName === 'IMG') {
        const src = node.getAttribute('src');
        if (src) {
          const buffer = await getFileBuffer(src);
          if (buffer) {
            children.push(new ImageRun({
              data: buffer,
              transformation: { width: 550, height: 350 },
            }));
          }
        }
        return;
      }

      const newStyles = { ...styles };
      if (tagName === 'STRONG' || tagName === 'B') newStyles.bold = true;
      if (tagName === 'EM' || tagName === 'I') newStyles.italics = true;
      if (tagName === 'U') newStyles.underline = true;

      for (const child of Array.from(node.childNodes)) {
        await walk(child, newStyles);
      }
    }
  };

  for (const child of Array.from(element.childNodes)) {
    await walk(child, {});
  }
  return children;
};

export const exportDocToDocx = async (title: string, blocks: ContentBlock[]) => {
  const docChildren: any[] = [];

  // 1. Title
  docChildren.push(new Paragraph({
    text: title || "제목 없음",
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.LEFT,
    spacing: { after: 400 },
  }));

  // 2. Parse HTML content
  const htmlContent = blocks[0]?.content || '';
  const parser = new DOMParser();
  const docHtml = parser.parseFromString(htmlContent, 'text/html');
  const bodyNodes = Array.from(docHtml.body.childNodes);

  const processBlockNode = async (node: Node, listContext?: { reference: string; level: number }) => {
    if (!(node instanceof HTMLElement)) return;

    const tagName = node.tagName.toUpperCase();

    // Headings
    const headingMap: Record<string, HeadingLevel> = {
      'H1': HeadingLevel.HEADING_1,
      'H2': HeadingLevel.HEADING_2,
      'H3': HeadingLevel.HEADING_3,
      'H4': HeadingLevel.HEADING_4,
      'H5': HeadingLevel.HEADING_5,
      'H6': HeadingLevel.HEADING_6,
    };

    if (headingMap[tagName]) {
      docChildren.push(new Paragraph({
        children: await parseNodeContent(node),
        heading: headingMap[tagName],
        spacing: { before: 200, after: 200 },
      }));
    } 
    else if (tagName === 'P' || tagName === 'DIV') {
      const children = await parseNodeContent(node);
      if (children.length > 0) {
        docChildren.push(new Paragraph({
          children: children,
          spacing: { after: 120 },
        }));
      }
    }
    else if (tagName === 'UL' || tagName === 'OL') {
      const isOrdered = tagName === 'OL';
      const level = (listContext?.level ?? -1) + 1;
      const ref = isOrdered ? "main-numbering" : "bullet-numbering";

      for (const li of Array.from(node.children)) {
        if (li.tagName.toUpperCase() === 'LI') {
          // LI can contain a P or text directly.
          // Tiptap often uses <li><p>text</p></li>
          const liElement = li as HTMLElement;
          const nestedList = Array.from(liElement.childNodes).find(
            child => child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')
          );

          // Content of LI excluding nested list
          const liClone = liElement.cloneNode(true) as HTMLElement;
          if (nestedList) {
            const nestedInClone = Array.from(liClone.childNodes).find(
              child => child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')
            );
            if (nestedInClone) liClone.removeChild(nestedInClone);
          }

          docChildren.push(new Paragraph({
            children: await parseNodeContent(liClone),
            bullet: isOrdered ? undefined : { level: level },
            numbering: isOrdered ? { reference: ref, level: level } : undefined,
            spacing: { after: 100 },
          }));

          if (nestedList) {
            await processBlockNode(nestedList, { reference: ref, level: level });
          }
        }
      }
    }
    else if (tagName === 'BLOCKQUOTE') {
      docChildren.push(new Paragraph({
        children: await parseNodeContent(node),
        indent: { left: 720 },
        spacing: { before: 200, after: 200 },
      }));
    }
    else if (tagName === 'HR') {
      docChildren.push(new Paragraph({
        thematicBreak: true,
        spacing: { before: 400, after: 400 },
      }));
    }
    else if (tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src) {
        const buffer = await getFileBuffer(src);
        if (buffer) {
          docChildren.push(new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 550, height: 350 } })],
            spacing: { before: 200, after: 200 },
          }));
        }
      }
    }
  };

  for (const node of bodyNodes) {
    await processBlockNode(node);
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "main-numbering",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.START },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: "%3.", alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ children: docChildren }],
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title || '문서'}-${new Date().toISOString().split('T')[0]}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
