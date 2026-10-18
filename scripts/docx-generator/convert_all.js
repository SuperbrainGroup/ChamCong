const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  ImageRun,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat
} = require('docx');

// Hàm đọc kích thước ảnh PNG từ buffer (chuẩn PNG IHDR)
function getPngDimensions(buf) {
  try {
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height };
    }
  } catch (e) {}
  return { width: 800, height: 600 };
}

// Phân tích inline markdown (in đậm, in nghiêng, code, link) thành TextRun
function parseInlineRuns(text, options = {}) {
  const runs = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const plain = text.substring(lastIdx, match.index);
      runs.push(new TextRun({
        text: plain,
        font: 'Segoe UI',
        size: options.size || 22, // 11pt = 22 half-pts
        color: options.color || '2D3748',
        italics: options.italics || false,
        bold: options.bold || false
      }));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(new TextRun({
        text: token.slice(2, -2),
        font: 'Segoe UI',
        size: options.size || 22,
        color: options.color || '1A202C',
        bold: true,
        italics: options.italics || false
      }));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push(new TextRun({
        text: token.slice(1, -1),
        font: 'Segoe UI',
        size: options.size || 22,
        color: options.color || '4A5568',
        italics: true,
        bold: options.bold || false
      }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(new TextRun({
        text: ' ' + token.slice(1, -1) + ' ',
        font: 'Consolas',
        size: (options.size || 22) - 2,
        color: 'C53030',
        shading: {
          type: ShadingType.CLEAR,
          fill: 'EDF2F7'
        }
      }));
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        runs.push(new TextRun({
          text: linkMatch[1],
          font: 'Segoe UI',
          size: options.size || 22,
          color: '0D6EFD',
          underline: {}
        }));
      }
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    runs.push(new TextRun({
      text: text.substring(lastIdx),
      font: 'Segoe UI',
      size: options.size || 22,
      color: options.color || '2D3748',
      italics: options.italics || false,
      bold: options.bold || false
    }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({
      text: '',
      font: 'Segoe UI',
      size: options.size || 22
    }));
  }

  return runs;
}

// Chuyển đổi toàn bộ nội dung markdown thành Document Section của docx
function markdownToDocx(mdContent, docTitle, baseDir) {
  const lines = mdContent.split(/\r?\n/);
  const children = [];
  let i = 0;

  // Header Cover Banner
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "HỆ THỐNG QUẢN TRỊ CHẤM CÔNG & NGHỈ PHÉP SUPERBRAIN",
          font: 'Segoe UI',
          size: 20,
          bold: true,
          color: '718096'
        })
      ]
    })
  );

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Dòng trống
    if (!line) {
      i++;
      continue;
    }

    // Tiêu đề H1
    if (line.startsWith('# ')) {
      const titleText = line.replace(/^#\s+/, '');
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({
              text: titleText,
              font: 'Segoe UI',
              size: 36, // 18pt
              bold: true,
              color: '0A369D' // Superbrain Blue
            })
          ]
        })
      );
      i++;
      continue;
    }

    // Tiêu đề H2
    if (line.startsWith('## ')) {
      const h2Text = line.replace(/^##\s+/, '');
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
          children: [
            new TextRun({
              text: h2Text,
              font: 'Segoe UI',
              size: 28, // 14pt
              bold: true,
              color: '1A56DB'
            })
          ]
        })
      );
      i++;
      continue;
    }

    // Tiêu đề H3
    if (line.startsWith('### ')) {
      const h3Text = line.replace(/^###\s+/, '');
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: h3Text,
              font: 'Segoe UI',
              size: 24, // 12pt
              bold: true,
              color: '2B6CB0'
            })
          ]
        })
      );
      i++;
      continue;
    }

    // Tiêu đề H4
    if (line.startsWith('#### ')) {
      const h4Text = line.replace(/^####\s+/, '');
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: h4Text,
              font: 'Segoe UI',
              size: 22,
              bold: true,
              color: '2D3748'
            })
          ]
        })
      );
      i++;
      continue;
    }

    // Hình ảnh markdown: ![caption](path)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const caption = imgMatch[1];
      let imgPath = imgMatch[2].replace(/\\/g, '/');

      let resolvedImgPath = path.isAbsolute(imgPath) ? imgPath : path.resolve(baseDir, imgPath);
      if (!fs.existsSync(resolvedImgPath)) {
        // Thử tìm trong docs/images
        const altPath = path.resolve(baseDir, 'docs/images', path.basename(imgPath));
        if (fs.existsSync(altPath)) {
          resolvedImgPath = altPath;
        }
      }

      if (fs.existsSync(resolvedImgPath)) {
        try {
          const imgBuffer = fs.readFileSync(resolvedImgPath);
          const dims = getPngDimensions(imgBuffer);
          const maxWidth = 540; // Điểm tối đa trên khổ A4 trừ lề
          let renderWidth = dims.width;
          let renderHeight = dims.height;

          if (renderWidth > maxWidth) {
            const ratio = maxWidth / renderWidth;
            renderWidth = maxWidth;
            renderHeight = Math.round(renderHeight * ratio);
          }

          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 80 },
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: renderWidth,
                    height: renderHeight
                  }
                })
              ]
            })
          );

          if (caption) {
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 200 },
                children: [
                  new TextRun({
                    text: `📸 Hình: ${caption}`,
                    font: 'Segoe UI',
                    size: 18,
                    italics: true,
                    color: '718096'
                  })
                ]
              })
            );
          }
        } catch (err) {
          console.error(`Không thể nạp ảnh ${resolvedImgPath}:`, err.message);
        }
      }
      i++;
      continue;
    }

    // Callout / Blockquote: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING]
    if (line.startsWith('>')) {
      const blockLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        let bText = lines[i].trim().replace(/^>\s?/, '');
        blockLines.push(bText);
        i++;
      }

      let calloutType = 'NOTE';
      let title = 'LƯU Ý';
      let fillColor = 'F7FAFC';
      let borderColor = 'CBD5E0';
      let titleColor = '2B6CB0';

      const firstLine = blockLines[0] || '';
      if (firstLine.includes('[!WARNING]')) {
        calloutType = 'WARNING';
        title = '⚠️ CẢNH BÁO QUAN TRỌNG';
        fillColor = 'FFFBEB';
        borderColor = 'D97706';
        titleColor = 'B45309';
        blockLines.shift();
      } else if (firstLine.includes('[!IMPORTANT]')) {
        calloutType = 'IMPORTANT';
        title = '📌 NGUYÊN TẮC BẮT BUỘC';
        fillColor = 'FEF2F2';
        borderColor = 'DC2626';
        titleColor = '991B1B';
        blockLines.shift();
      } else if (firstLine.includes('[!TIP]')) {
        calloutType = 'TIP';
        title = '💡 MẸO HỮU ÍCH';
        fillColor = 'F0FDF4';
        borderColor = '16A34A';
        titleColor = '15803D';
        blockLines.shift();
      } else if (firstLine.includes('[!NOTE]')) {
        calloutType = 'NOTE';
        title = 'ℹ️ GHI CHÚ VẬN HÀNH';
        fillColor = 'EFF6FF';
        borderColor = '2563EB';
        titleColor = '1D4ED8';
        blockLines.shift();
      }

      // Xây dựng các đoạn trong Callout Box
      const calloutParas = [];
      calloutParas.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun({
              text: title,
              font: 'Segoe UI',
              size: 20,
              bold: true,
              color: titleColor
            })
          ]
        })
      );

      for (const bLine of blockLines) {
        if (!bLine.trim()) continue;
        calloutParas.push(
          new Paragraph({
            spacing: { before: 40, after: 40 },
            children: parseInlineRuns(bLine, { size: 20, color: '374151' })
          })
        );
      }

      // Bọc trong Table 1 ô có viền trái nổi bật
      const calloutTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: fillColor },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.SINGLE, size: 24, color: borderColor }
                },
                children: calloutParas
              })
            ]
          })
        ]
      });

      children.push(calloutTable);
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Bảng Markdown: | ... | ... |
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const rows = [];
        let isHeader = true;

        for (let rIdx = 0; rIdx < tableLines.length; rIdx++) {
          const tLine = tableLines[rIdx];
          // Bỏ qua dòng separator: |---|---|
          if (/^\|(\s*[-:]+\s*\|)+$/.test(tLine)) {
            isHeader = false;
            continue;
          }

          const rawCells = tLine.split('|').slice(1, -1);
          const rowCells = rawCells.map(cText => {
            const cleanText = cText.trim();
            return new TableCell({
              shading: isHeader
                ? { type: ShadingType.CLEAR, fill: '0A369D' }
                : (rIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F8FAFC' } : { type: ShadingType.CLEAR, fill: 'FFFFFF' }),
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
              },
              children: [
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: parseInlineRuns(cleanText, {
                    size: 20,
                    bold: isHeader,
                    color: isHeader ? 'FFFFFF' : '2D3748'
                  })
                })
              ]
            });
          });

          rows.push(new TableRow({ children: rowCells }));
          if (rIdx === 0) isHeader = false;
        }

        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows
          })
        );
        children.push(new Paragraph({ spacing: { after: 140 } }));
      }
      continue;
    }

    // Danh sách không thứ tự: - hoặc *
    if (/^[-*]\s+/.test(line)) {
      const listText = line.replace(/^[-*]\s+/, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
          children: parseInlineRuns(listText, { size: 22 })
        })
      );
      i++;
      continue;
    }

    // Danh sách có thứ tự: 1. 2. 3.
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const numPrefix = numMatch[1];
      const restText = numMatch[2];
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 400 },
          children: [
            new TextRun({
              text: `${numPrefix}. `,
              font: 'Segoe UI',
              size: 22,
              bold: true,
              color: '0A369D'
            }),
            ...parseInlineRuns(restText, { size: 22 })
          ]
        })
      );
      i++;
      continue;
    }

    // Đường kẻ ngang: ---
    if (/^---{3,}$/.test(line)) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 160 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: 'E2E8F0' }
          }
        })
      );
      i++;
      continue;
    }

    // Đoạn văn chuẩn (Paragraph)
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60, line: 276 }, // 1.15 line spacing
        children: parseInlineRuns(line, { size: 22 })
      })
    );
    i++;
  }

  // Khởi tạo Document với Header & Footer
  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Segoe UI',
            size: 22,
            color: '2D3748'
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 100 },
                children: [
                  new TextRun({
                    text: docTitle,
                    font: 'Segoe UI',
                    size: 16,
                    color: 'A0AEC0'
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.SPACE_BETWEEN,
                children: [
                  new TextRun({
                    text: "Superbrain Vietnam — Tài liệu lưu hành nội bộ",
                    font: 'Segoe UI',
                    size: 16,
                    color: 'A0AEC0'
                  }),
                  new TextRun({
                    text: "   |   Trang ",
                    font: 'Segoe UI',
                    size: 16,
                    color: 'A0AEC0'
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Segoe UI',
                    size: 16,
                    color: 'A0AEC0'
                  })
                ]
              })
            ]
          })
        },
        children: children
      }
    ]
  });
}

// Chạy chuyển đổi cho từng file
async function convertFile(inputMdPath, outputDocxPath, title, baseDir) {
  console.log(`Đang xử lý: ${inputMdPath} -> ${outputDocxPath}`);
  const content = fs.readFileSync(inputMdPath, 'utf8');
  const doc = markdownToDocx(content, title, baseDir);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputDocxPath, buffer);
  console.log(`✅ Xuất thành công: ${outputDocxPath} (${Math.round(buffer.length / 1024)} KB)`);
}

async function main() {
  const rootDir = path.resolve(__dirname, '../..');

  const files = [
    {
      input: path.resolve(rootDir, 'so_tay_nhan_vien.md'),
      output: path.resolve(rootDir, 'so_tay_nhan_vien.docx'),
      title: 'Sổ Tay Hướng Dẫn Sử Dụng — Dành Cho Nhân Viên (ESS)'
    },
    {
      input: path.resolve(rootDir, 'so_tay_hr.md'),
      output: path.resolve(rootDir, 'so_tay_hr.docx'),
      title: 'Sổ Tay Hướng Dẫn Vận Hành — Dành Cho Bộ Phận Nhân Sự (HR)'
    },
    {
      input: path.resolve(rootDir, 'so_tay_admin.md'),
      output: path.resolve(rootDir, 'so_tay_admin.docx'),
      title: 'Sổ Tay Hướng Dẫn Quản Trị — Dành Cho Quản Trị Viên (Admin)'
    },
    {
      input: path.resolve(rootDir, 'so_tay_phan_mem.md'),
      output: path.resolve(rootDir, 'so_tay_phan_mem.docx'),
      title: 'Sổ Tay Phần Mềm Tổng Hợp — Hệ Thống Chấm Công Superbrain'
    }
  ];

  for (const item of files) {
    if (fs.existsSync(item.input)) {
      await convertFile(item.input, item.output, item.title, rootDir);
    } else {
      console.warn(`File không tồn tại: ${item.input}`);
    }
  }

  console.log("\n🎉 HOÀN TẤT CHUYỂN ĐỔI TOÀN BỘ SỔ TAY SANG FILE WORD (.DOCX)!");
}

main().catch(err => {
  console.error("Lỗi khi chuyển đổi Word:", err);
  process.exit(1);
});
