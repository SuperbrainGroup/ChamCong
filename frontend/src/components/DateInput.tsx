import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

interface DateInputProps {
  value: string; // Định dạng YYYY-MM-DD hoặc ISO
  onChange: (value: string) => void; // Xuất ra YYYY-MM-DD hoặc rỗng
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Chuyển đổi YYYY-MM-DD sang DD/MM/YYYY để hiển thị cho người dùng Việt Nam
 */
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const clean = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return iso;
}

/**
 * Chuyển đổi DD/MM/YYYY sang YYYY-MM-DD
 */
function displayToIso(display: string): string | null {
  if (!display) return '';
  const parts = display.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);

    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      // Kiểm tra ngày hợp lệ theo tháng
      const dateObj = new Date(y, m - 1, d);
      if (
        dateObj.getFullYear() === y &&
        dateObj.getMonth() === m - 1 &&
        dateObj.getDate() === d
      ) {
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  required = false,
  disabled = false,
  className = 'form-control',
  min,
  max,
  id,
  style,
}) => {
  const [displayText, setDisplayText] = useState(() => isoToDisplay(value));
  const [isInvalid, setIsInvalid] = useState(false);
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ khi prop value từ ngoài thay đổi
  useEffect(() => {
    setDisplayText(isoToDisplay(value));
    setIsInvalid(false);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9/]/g, '');

    // Tự động thêm dấu gạch chéo khi người dùng gõ ngày/tháng
    if (raw.length === 2 && !raw.includes('/') && displayText.length < 2) {
      raw = raw + '/';
    } else if (raw.length === 5 && raw.split('/').length === 2 && displayText.length < 5) {
      raw = raw + '/';
    }

    if (raw.length > 10) {
      raw = raw.substring(0, 10);
    }

    setDisplayText(raw);

    if (raw.trim() === '') {
      setIsInvalid(false);
      onChange('');
      return;
    }

    if (raw.length === 10) {
      const iso = displayToIso(raw);
      if (iso) {
        setIsInvalid(false);
        onChange(iso);
      } else {
        setIsInvalid(true);
      }
    } else {
      setIsInvalid(false);
    }
  };

  const handleBlur = () => {
    if (displayText.trim() === '') {
      setIsInvalid(false);
      onChange('');
      return;
    }
    const iso = displayToIso(displayText);
    if (!iso) {
      setIsInvalid(true);
    } else {
      setIsInvalid(false);
      onChange(iso);
    }
  };

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setDisplayText(isoToDisplay(val));
      setIsInvalid(false);
      onChange(val);
    }
  };

  const openPicker = () => {
    if (disabled) return;
    if (hiddenDateInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          hiddenDateInputRef.current.showPicker();
        } else {
          hiddenDateInputRef.current.focus();
        }
      } catch {
        hiddenDateInputRef.current.focus();
      }
    }
  };

  const currentIso = displayToIso(displayText) || (value ? (value.includes('T') ? value.split('T')[0] : value) : '');

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
        ...style,
      }}
    >
      <input
        type="text"
        id={id}
        className={`${className} ${isInvalid ? 'border-danger' : ''}`}
        placeholder={placeholder}
        value={displayText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        maxLength={10}
        style={{
          paddingRight: '36px',
          borderColor: isInvalid ? 'var(--danger, #ef4444)' : undefined,
          width: '100%',
        }}
        title="Nhập theo định dạng ngày/tháng/năm (dd/mm/yyyy)"
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: disabled ? '#94a3b8' : 'var(--neutral-500, #64748b)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
        title="Mở lịch chọn ngày"
      >
        <Calendar size={16} />
      </button>

      {/* Input date ẩn hỗ trợ popup lịch mặc định của trình duyệt */}
      <input
        ref={hiddenDateInputRef}
        type="date"
        tabIndex={-1}
        value={currentIso}
        min={min}
        max={max}
        onChange={handleNativePickerChange}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: '1px',
          height: '1px',
          bottom: 0,
          right: 0,
        }}
      />
    </div>
  );
};
