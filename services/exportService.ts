
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } from "docx";
import { ContentBlock } from "../types";

/**
 * Utility to convert various sources (DataURL, Blob URL) to Uint8Array
 */
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
 * Captures a still frame from a video URL at 0.5 seconds
 */
const captureVideoFrame = async (videoUrl: string): Promise<Uint8Array | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.currentTime = 0.5; // Capture at 0.5s mark

    const timeout = setTimeout(() => {
      resolve(null);
    }, 5000); // 5s timeout

    video.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          clearTimeout(timeout);
          if (blob) {
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          } else {
            resolve(null);
          }
        }, 'image/jpeg');
      } else {
        clearTimeout(timeout);
        resolve(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
  });
};

/**
 * Removes HTML tags from a string for basic text export
 */
const cleanHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

export const exportDocToDocx = async (title: string, blocks: ContentBlock[]) => {
  const children: any[] = [
    new Paragraph({
      text: title || "Untitled Document",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      spacing: { after: 400 },
    }),
  ];

  for (const block of blocks) {
    if (block.type === 'text') {
      const text = cleanHtml(block.content).trim();
      if (text) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                size: 24,
              }),
            ],
            spacing: { after: 300 },
          })
        );
      }
    } else if (block.type === 'image') {
      const buffer = await getFileBuffer(block.content);
      if (buffer) {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: buffer,
                transformation: { width: 500, height: 350 },
              }),
            ],
            spacing: { after: 300, before: 100 },
          })
        );
      }
    } else if (block.type === 'video') {
      // User requested to include "video photos" (stills) in the export
      const buffer = await captureVideoFrame(block.content);
      if (buffer) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "[Video Snapshot]", italics: true, color: "666666" })
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: buffer,
                transformation: { width: 500, height: 350 },
              }),
            ],
            spacing: { after: 300 },
          })
        );
      } else {
        // Fallback placeholder if frame capture fails
        children.push(
          new Paragraph({
            text: `[Video Attachment: ${block.mimeType || 'Video'}]`,
            spacing: { after: 300 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title || 'Document'}-${new Date().toISOString().split('T')[0]}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
