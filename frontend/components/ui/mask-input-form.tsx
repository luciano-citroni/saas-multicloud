"use client";

import { LucideIcon } from "lucide-react";
import React, { useReducer } from "react";
import { UseFormReturn, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { IconInput } from "../ui/input-icon";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";

interface TextInputProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  placeholder: string;
  disabled?: boolean;
  formatter: (value: string) => string;
  icon?: LucideIcon;
  maxLength: number;
  removeMask?: boolean;
  classNameItem?: string;
}

const InputMaskForm = <TFieldValues extends FieldValues>({
  form,
  name,
  label,
  placeholder,
  disabled = false,
  formatter,
  icon,
  maxLength,
  removeMask = true,
  classNameItem,
}: TextInputProps<TFieldValues>) => {
  const initialValue = form.getValues()[name]
    ? formatter(form.getValues()[name] as string)
    : "";

  const [value, setValue] = useReducer((_: string, next: string) => {
    const digits = next.replace(/\D/g, "");
    return formatter(digits);
  }, initialValue);

  function handleChange(
    realChangeFn: (value: string) => void,
    formattedValue: string,
  ) {
    const digits = removeMask
      ? formattedValue.replace(/\D/g, "")
      : formattedValue;

    realChangeFn(digits);
  }

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const _change = field.onChange;

        return (
          <FormItem className={cn("", classNameItem)}>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              {icon ? (
                <IconInput
                  {...field}
                  StartIcon={icon}
                  placeholder={placeholder}
                  value={value}
                  disabled={disabled}
                  maxLength={maxLength}
                  onChange={(e) => {
                    setValue(e.target.value);
                    handleChange(_change, e.target.value);
                  }}
                />
              ) : (
                <Input
                  {...field}
                  placeholder={placeholder}
                  value={value}
                  disabled={disabled}
                  maxLength={maxLength}
                  onChange={(e) => {
                    setValue(e.target.value);
                    handleChange(_change, e.target.value);
                  }}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

InputMaskForm.displayName = "InputMaskForm";

export { InputMaskForm };
