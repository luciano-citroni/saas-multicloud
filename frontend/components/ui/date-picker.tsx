"use client"

import * as React from "react"
import { format } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useFormField } from "@/components/ui/form"
import { useLocale } from "@/components/providers/locale-provider"
import { useTranslations } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const START_MONTH = new Date(2015, 0)
const END_MONTH = new Date(new Date().getFullYear() + 10, 11)

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

type DatePickerProps = {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  name?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
}

function DatePicker({
  value,
  onChange,
  onBlur,
  name,
  disabled,
  placeholder,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const { locale } = useLocale()
  const tc = useTranslations("common")
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  const dateLocale = locale === "en" ? enUS : ptBR
  const selected = parseIsoDate(value)

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id ?? formItemId}
          name={name}
          disabled={disabled}
          data-empty={!selected}
          aria-invalid={!!error}
          aria-describedby={
            !error
              ? formDescriptionId
              : `${formDescriptionId} ${formMessageId}`
          }
          className={cn(
            "w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
            className
          )}
        >
          <CalendarIcon />
          {selected ? (
            format(selected, "P", { locale: dateLocale })
          ) : (
            <span>{placeholder ?? tc.selectDate}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="pointer-events-auto z-[60] w-auto p-0"
      >
        <Calendar
          mode="single"
          locale={dateLocale}
          captionLayout="dropdown"
          startMonth={START_MONTH}
          endMonth={END_MONTH}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange?.(date ? toIsoDate(date) : "")
            if (date) setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function preventDismissOnDatePicker(event: { preventDefault: () => void; target: EventTarget | null }) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest("[data-slot='popover-content']")) {
    event.preventDefault()
  }
}

export { DatePicker, preventDismissOnDatePicker }
