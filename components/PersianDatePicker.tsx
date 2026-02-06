import React, { useMemo } from "react";
import DatePicker from "react-multi-date-picker";
import TimePicker from "react-multi-date-picker/plugins/time_picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";

type PickerType = "DATE" | "TIME" | "DATETIME";

interface PersianDatePickerProps {
  value?: string | null;
  onChange: (val: string | null) => void;
  type: PickerType;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  type,
  className,
  disabled,
  placeholder,
}) => {
  const pickerValue = useMemo(() => {
    if (!value) return null;
    try {
      if (type === "TIME") {
        return new DateObject({
          date: `1970-01-01 ${value}`,
          format: "YYYY-MM-DD HH:mm",
          calendar: gregorian,
          locale: gregorian_en,
        }).convert(persian, persian_fa);
      }

      if (type === "DATE") {
        return new DateObject({
          date: value,
          format: "YYYY-MM-DD",
          calendar: gregorian,
          locale: gregorian_en,
        }).convert(persian, persian_fa);
      }

      const jsDate = new Date(value);
      if (Number.isNaN(jsDate.getTime())) return null;
      return new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa);
    } catch {
      return null;
    }
  }, [value, type]);

  const handleChange = (date: DateObject | null) => {
    if (!date) {
      onChange(null);
      return;
    }

    const greg = date.convert(gregorian, gregorian_en);

    if (type === "DATE") {
      onChange(greg.format("YYYY-MM-DD"));
      return;
    }

    if (type === "TIME") {
      onChange(greg.format("HH:mm"));
      return;
    }

    onChange(greg.toDate().toISOString());
  };

  const format =
    type === "DATE" ? "YYYY/MM/DD" : type === "TIME" ? "HH:mm" : "YYYY/MM/DD HH:mm";

  const pickerProps: any = {
    value: pickerValue as any,
    onChange: handleChange,
    calendar: persian,
    locale: persian_fa,
    format,
    plugins:
      type === "DATETIME" || type === "TIME"
        ? [<TimePicker key="time" position="bottom" hideSeconds />]
        : [],
    className,
    inputClass: "w-full persian-number",
    containerClassName: "w-full",
    disabled,
    placeholder,
  };

  if (type === "TIME") {
    pickerProps.onlyTimePicker = true;
    pickerProps.disableDayPicker = true;
  }

  return <DatePicker {...pickerProps} />;
};

export default PersianDatePicker;
