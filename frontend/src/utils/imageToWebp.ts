/**
 * Chuyển đổi và nén hình ảnh sang định dạng WebP trước khi upload lên máy chủ.
 * Giúp giảm dung lượng tối đa (lên tới 85-90%) và tiết kiệm băng thông máy chủ.
 */
export interface WebpConvertResult {
  file: File;
  originalSize: number;
  webpSize: number;
  previewUrl: string;
}

export async function convertImageToWebP(
  file: File,
  quality = 0.82,
  maxWidth = 1920
): Promise<WebpConvertResult> {
  const originalSize = file.size;

  // Nếu không phải là tệp ảnh, giữ nguyên
  if (!file.type.startsWith('image/')) {
    return {
      file,
      originalSize,
      webpSize: file.size,
      previewUrl: URL.createObjectURL(file)
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Giới hạn độ phân giải tối đa (1920px) để tránh tràn bộ nhớ với ảnh camera 4K/8K
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            file,
            originalSize,
            webpSize: file.size,
            previewUrl: URL.createObjectURL(file)
          });
          return;
        }

        // Vẽ ảnh lên canvas với làm mịn
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Xuất sang blob định dạng webp
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                file,
                originalSize,
                webpSize: file.size,
                previewUrl: URL.createObjectURL(file)
              });
              return;
            }

            const rawBase = file.name ? (file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name) : 'minh_chung';
            const cleanBase = rawBase.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'evidence';
            const webpFile = new File([blob], `${cleanBase}.webp`, {
              type: 'image/webp',
              lastModified: Date.now()
            });

            resolve({
              file: webpFile,
              originalSize,
              webpSize: webpFile.size,
              previewUrl: URL.createObjectURL(blob)
            });
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => {
        const safeName = file.name && file.name.includes('.') ? file.name : `${file.name || 'evidence'}.jpg`;
        const safeFile = new File([file], safeName, { type: file.type || 'image/jpeg' });
        resolve({
          file: safeFile,
          originalSize,
          webpSize: file.size,
          previewUrl: URL.createObjectURL(file)
        });
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      const safeName = file.name && file.name.includes('.') ? file.name : `${file.name || 'evidence'}.jpg`;
      const safeFile = new File([file], safeName, { type: file.type || 'image/jpeg' });
      resolve({
        file: safeFile,
        originalSize,
        webpSize: file.size,
        previewUrl: URL.createObjectURL(file)
      });
    };

    reader.readAsDataURL(file);
  });
}

export async function convertMultipleImagesToWebP(
  files: File[],
  quality = 0.82
): Promise<WebpConvertResult[]> {
  const promises = files.map((f) => convertImageToWebP(f, quality));
  return Promise.all(promises);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
