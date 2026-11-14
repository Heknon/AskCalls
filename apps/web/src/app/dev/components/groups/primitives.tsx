'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@askcalls/ui/primitives/accordion';
import { Alert } from '@askcalls/ui/primitives/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@askcalls/ui/primitives/alert-dialog';
import { Avatar } from '@askcalls/ui/primitives/avatar';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { Calendar } from '@askcalls/ui/primitives/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@askcalls/ui/primitives/card';
import { Checkbox } from '@askcalls/ui/primitives/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@askcalls/ui/primitives/context-menu';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@askcalls/ui/primitives/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@askcalls/ui/primitives/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@askcalls/ui/primitives/hover-card';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { NativeSelect } from '@askcalls/ui/primitives/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@askcalls/ui/primitives/popover';
import { Progress } from '@askcalls/ui/primitives/progress';
import { RadioGroup, RadioGroupItem } from '@askcalls/ui/primitives/radio-group';
import { ScrollArea } from '@askcalls/ui/primitives/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Separator } from '@askcalls/ui/primitives/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@askcalls/ui/primitives/sheet';
import { Skeleton } from '@askcalls/ui/primitives/skeleton';
import { Slider } from '@askcalls/ui/primitives/slider';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { Switch } from '@askcalls/ui/primitives/switch';
import { Table, TableCell, TableHead, TableRow } from '@askcalls/ui/primitives/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { Textarea } from '@askcalls/ui/primitives/textarea';
import { Toggle } from '@askcalls/ui/primitives/toggle';
import { ToggleGroup, ToggleGroupItem } from '@askcalls/ui/primitives/toggle-group';
import { Tooltip } from '@askcalls/ui/primitives/tooltip';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { enUS, he } from 'react-day-picker/locale';
import { Specimen, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    primary: 'Upload calls',
    secondary: 'Secondary',
    outline: 'Download',
    ghost: 'Ghost',
    destructive: 'Delete call',
    link: 'Settings → Providers',
    loading: 'Testing…',
    disabled: 'Disabled',
    email: 'Email',
    emailHint: 'We send sign-in links here.',
    invalid: 'Enter a valid email address.',
    notes: 'Notes',
    model: 'Model',
    autoLock: 'Auto-lock',
    remember: "Don't ask again until I lock AskCalls",
    telemetry: 'Share anonymous usage counts',
    lock: [
      ['5', '5 min'],
      ['15', '15 min'],
      ['60', '1 hour'],
    ],
    seg: ['AskCalls managed', 'Your own key', 'Off'],
    tabs: ['Ask', 'Notes'],
    tabBody: ['Ask about this call', 'Private notes on this call'],
    cardTitle: 'Recordings',
    cardDesc: 'Recording backups use your storage quota.',
    save: 'Save',
    badges: ['Neutral', 'This device', 'Healthy', 'Needs CORS', 'Failed', 'Outline'],
    alerts: [
      'Only link a device you are holding. AskCalls never asks for this code.',
      'Import paused: 38 of 138 done.',
      'Wrong code. Check each group and try again.',
      'Import done: 138 calls.',
    ],
    tip: 'Locks after 15 min idle',
    popover: 'Popover',
    popBody: 'Anchored content for pickers and colour choices.',
    hover: 'Signed by MacBook Air',
    hoverBody: 'Your device signed this transcript when it was created.',
    dialog: 'Open dialog',
    dialogTitle: 'Link a device',
    dialogBody: 'Scan the code with the new device.',
    cancel: 'Cancel',
    confirm: 'Continue',
    alert: 'Open alert dialog',
    alertTitle: 'Delete this call?',
    alertBody: 'The transcript, notes, tags and recording are deleted for good.',
    sheetEnd: 'Open side sheet',
    sheetBottom: 'Open bottom sheet',
    sheetTitle: 'Ask and notes',
    menu: 'Open menu',
    menuLabel: 'Download',
    menuItems: ['Transcript (TXT)', 'Subtitles (SRT)', 'Delete call'],
    context: 'Right-click here',
    progress: 'Progress',
    table: ['File', 'Status'],
    rows: [
      ['call-01.m4a', 'Done'],
      ['call-02.m4a', 'Queued'],
    ],
    faq: ['Is recording legal?', 'Check the rules where you and the other party are.'],
    scroll: 'Scroll area',
    range: 'Date range',
  },
  he: {
    primary: 'העלאת שיחות',
    secondary: 'משני',
    outline: 'הורדה',
    ghost: 'שקוף',
    destructive: 'מחיקת השיחה',
    link: 'הגדרות ← ספקים',
    loading: 'בודק…',
    disabled: 'מושבת',
    email: 'אימייל',
    emailHint: 'קישורי כניסה נשלחים לכאן.',
    invalid: 'יש להזין כתובת אימייל תקינה.',
    notes: 'הערות',
    model: 'מודל',
    autoLock: 'נעילה אוטומטית',
    remember: 'לא לשאול שוב עד שאנעל את AskCalls',
    telemetry: 'שיתוף ספירות שימוש אנונימיות',
    lock: [
      ['5', '5 דק׳'],
      ['15', '15 דק׳'],
      ['60', 'שעה'],
    ],
    seg: ['מנוהל ב-AskCalls', 'מפתח משלך', 'כבוי'],
    tabs: ['שאלה', 'הערות'],
    tabBody: ['שאלה על השיחה הזאת', 'הערות פרטיות על השיחה'],
    cardTitle: 'הקלטות',
    cardDesc: 'גיבוי הקלטות משתמש במכסת האחסון שלך.',
    save: 'שמירה',
    badges: ['ניטרלי', 'המכשיר הזה', 'תקין', 'חסר CORS', 'נכשל', 'מתאר'],
    alerts: [
      'יש לקשר רק מכשיר שנמצא בידיים שלך. AskCalls אף פעם לא מבקשת את הקוד הזה.',
      'הייבוא הושהה: 38 מתוך 138 הושלמו.',
      'קוד שגוי. כדאי לבדוק כל קבוצה ולנסות שוב.',
      'הייבוא הושלם: 138 שיחות.',
    ],
    tip: 'ננעל אחרי 15 דקות ללא פעילות',
    popover: 'חלונית',
    popBody: 'תוכן מעוגן לבוררים ולבחירת צבע.',
    hover: 'נחתם על ידי MacBook Air',
    hoverBody: 'המכשיר שלך חתם על התמלול כשנוצר.',
    dialog: 'פתיחת דו-שיח',
    dialogTitle: 'קישור מכשיר',
    dialogBody: 'יש לסרוק את הקוד במכשיר החדש.',
    cancel: 'ביטול',
    confirm: 'המשך',
    alert: 'פתיחת אישור',
    alertTitle: 'למחוק את השיחה?',
    alertBody: 'התמלול, ההערות, התגיות וההקלטה יימחקו לצמיתות.',
    sheetEnd: 'פתיחת חלונית צד',
    sheetBottom: 'פתיחת גיליון תחתון',
    sheetTitle: 'שאלה והערות',
    menu: 'פתיחת תפריט',
    menuLabel: 'הורדה',
    menuItems: ['תמלול (TXT)', 'כתוביות (SRT)', 'מחיקת השיחה'],
    context: 'לחיצה ימנית כאן',
    progress: 'התקדמות',
    table: ['קובץ', 'מצב'],
    rows: [
      ['call-01.m4a', 'הושלם'],
      ['call-02.m4a', 'בתור'],
    ],
    faq: ['האם מותר להקליט?', 'כדאי לבדוק את הכללים במקום שבו נמצאים שני הצדדים.'],
    scroll: 'אזור גלילה',
    range: 'טווח תאריכים',
  },
};

export function PrimitivesGroup() {
  const c = useCopy(copy);
  const { lang } = useEnv();
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date('2026-11-03'),
    to: new Date('2026-11-09'),
  });
  return (
    <>
      <Specimen
        name="Button"
        note="primary · secondary · outline · ghost · destructive · link; sm · default · lg · icon; loading; disabled"
        wide
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">
            <Upload className="size-4" aria-hidden />
            {c.primary}
          </Button>
          <Button variant="secondary">{c.secondary}</Button>
          <Button variant="outline">
            <Download className="size-4" aria-hidden />
            {c.outline}
          </Button>
          <Button variant="ghost">{c.ghost}</Button>
          <Button variant="destructive">{c.destructive}</Button>
          <Button variant="link">{c.link}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm">
            {c.primary}
          </Button>
          <Button variant="primary" size="lg">
            {c.primary}
          </Button>
          <Button variant="outline" size="icon" aria-label={c.outline}>
            <Download className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={c.outline}>
            <Download className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" loading>
            {c.loading}
          </Button>
          <Button variant="primary" disabled>
            {c.disabled}
          </Button>
        </div>
      </Specimen>
      <Specimen name="Input, Textarea, Label">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-email">{c.email}</Label>
          <Input
            id="p-email"
            type="email"
            dir="ltr"
            defaultValue="dana@example.com"
            aria-describedby="p-email-h"
          />
          <p id="p-email-h" className="text-muted-foreground text-sm">
            {c.emailHint}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-bad">{c.email}</Label>
          <Input
            id="p-bad"
            type="email"
            dir="ltr"
            defaultValue="dana@"
            aria-invalid
            aria-describedby="p-bad-e"
          />
          <p id="p-bad-e" className="text-destructive text-sm">
            {c.invalid}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-notes">{c.notes}</Label>
          <Textarea id="p-notes" dir="auto" defaultValue="לשלוח הצעה כתובה עד יום ראשון." />
        </div>
      </Specimen>
      <Specimen name="Select, NativeSelect, Checkbox, Switch, RadioGroup">
        <div className="flex flex-col gap-1.5">
          <Label>{c.autoLock}</Label>
          <Select defaultValue="15">
            <SelectTrigger aria-label={c.autoLock}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {c.lock.map(([v, l]) => (
                <SelectItem key={v} value={v!}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NativeSelect aria-label={c.autoLock} defaultValue="15">
          {c.lock.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-2">
          <Checkbox id="p-c1" defaultChecked />
          <Label htmlFor="p-c1" className="font-normal">
            {c.remember}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="p-s1" defaultChecked />
          <Label htmlFor="p-s1" className="font-normal">
            {c.telemetry}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="p-s2" size="sm" />
          <Label htmlFor="p-s2" className="font-normal">
            {c.telemetry}
          </Label>
        </div>
        <RadioGroup defaultValue="15" aria-label={c.autoLock} className="flex gap-4">
          {c.lock.map(([v, l]) => (
            <div key={v} className="flex items-center gap-2">
              <RadioGroupItem id={`p-r${v}`} value={v!} />
              <Label htmlFor={`p-r${v}`} className="font-normal">
                {l}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Specimen>
      <Specimen name="ToggleGroup, Toggle, Tabs">
        <ToggleGroup type="single" defaultValue="0" aria-label={c.model} className="self-start">
          {c.seg.map((s, i) => (
            <ToggleGroupItem key={s} value={String(i)}>
              {s}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex gap-2">
          <Toggle variant="chip" defaultPressed>
            {c.seg[0]}
          </Toggle>
          <Toggle variant="chip">{c.seg[1]}</Toggle>
        </div>
        <Tabs defaultValue="0">
          <TabsList>
            {c.tabs.map((t, i) => (
              <TabsTrigger key={t} value={String(i)}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          {c.tabBody.map((b, i) => (
            <TabsContent key={b} value={String(i)} className="py-3 text-muted-foreground">
              {b}
            </TabsContent>
          ))}
        </Tabs>
      </Specimen>
      <Specimen name="Card, Badge, Avatar, Separator">
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>{c.cardTitle}</CardTitle>
            <CardDescription>{c.cardDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={64} aria-label={c.progress} />
          </CardContent>
          <CardFooter>
            <Button variant="primary" size="sm">
              {c.save}
            </Button>
          </CardFooter>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          {(['neutral', 'accent', 'success', 'warning', 'destructive', 'outline'] as const).map(
            (v, i) => (
              <Badge key={v} variant={v}>
                {c.badges[i]}
              </Badge>
            ),
          )}
          <Separator orientation="vertical" className="h-5" />
          <Avatar initials="DL" />
        </div>
      </Specimen>
      <Specimen name="Alert">
        {(['warning', 'info', 'destructive', 'success'] as const).map((t, i) => (
          <Alert key={t} tone={t}>
            {c.alerts[i]}
          </Alert>
        ))}
      </Specimen>
      <Specimen name="Progress, Slider, Skeleton, Spinner">
        {(['primary', 'warning', 'destructive', 'success'] as const).map((t, i) => (
          <Progress key={t} value={[30, 85, 100, 100][i]} tone={t} aria-label={c.progress} />
        ))}
        <Slider defaultValue={[40]} max={100} thumbLabel={c.progress} />
        <div className="flex flex-col gap-2">
          <Skeleton className="w-3/4" />
          <Skeleton className="w-1/2" />
        </div>
        <Spinner label={c.loading} className="size-5" />
      </Specimen>
      <Specimen name="Tooltip, Popover, HoverCard">
        <div className="flex flex-wrap gap-2">
          <Tooltip content={c.tip}>
            <Button variant="outline">{c.tip.split(' ')[0]}</Button>
          </Tooltip>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">{c.popover}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4 text-sm">{c.popBody}</PopoverContent>
          </Popover>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="outline">{c.hover}</Button>
            </HoverCardTrigger>
            <HoverCardContent>{c.hoverBody}</HoverCardContent>
          </HoverCard>
        </div>
      </Specimen>
      <Specimen name="Dialog, AlertDialog, Sheet">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">{c.dialog}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={c.cancel}>
              <DialogHeader>
                <DialogTitle>{c.dialogTitle}</DialogTitle>
                <DialogDescription>{c.dialogBody}</DialogDescription>
              </DialogHeader>
              <DialogBody />
              <DialogFooter>
                <Button variant="outline">{c.cancel}</Button>
                <Button variant="primary">{c.confirm}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">{c.alert}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>{c.alertTitle}</AlertDialogTitle>
              <AlertDialogDescription>{c.alertBody}</AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
                <AlertDialogAction>{c.destructive}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {(['end', 'bottom'] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="outline">{side === 'end' ? c.sheetEnd : c.sheetBottom}</Button>
              </SheetTrigger>
              <SheetContent side={side} className="p-6">
                <SheetTitle className="font-semibold text-lg">{c.sheetTitle}</SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  {c.tabBody[0]}
                </SheetDescription>
              </SheetContent>
            </Sheet>
          ))}
        </div>
      </Specimen>
      <Specimen name="DropdownMenu, ContextMenu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="self-start">
              {c.menu}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{c.menuLabel}</DropdownMenuLabel>
            <DropdownMenuItem>{c.menuItems[0]}</DropdownMenuItem>
            <DropdownMenuItem>{c.menuItems[1]}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">{c.menuItems[2]}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger className="flex h-16 items-center justify-center rounded-md border border-border border-dashed text-muted-foreground text-sm">
            {c.context}
          </ContextMenuTrigger>
          <ContextMenuContent>
            {c.menuItems.map((m) => (
              <ContextMenuItem key={m}>{m}</ContextMenuItem>
            ))}
          </ContextMenuContent>
        </ContextMenu>
      </Specimen>
      <Specimen name="Table, Accordion, ScrollArea">
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                {c.table.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map(([f, s]) => (
                <TableRow key={f}>
                  <TableCell className="font-mono">{f}</TableCell>
                  <TableCell>{s}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
        <Accordion type="single" collapsible>
          <AccordionItem value="a">
            <AccordionTrigger>{c.faq[0]}</AccordionTrigger>
            <AccordionContent>{c.faq[1]}</AccordionContent>
          </AccordionItem>
        </Accordion>
        <ScrollArea className="h-24 rounded-md border border-border" aria-label={c.scroll}>
          <div className="p-3 text-sm leading-6">
            {c.alerts.join(' ')} {c.alerts.join(' ')}
          </div>
        </ScrollArea>
      </Specimen>
      <Specimen name="Calendar" note="range; the date blank's custom range">
        <div className="self-start rounded-lg border border-border bg-popover p-3">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            defaultMonth={new Date('2026-11-01')}
            locale={lang === 'he' ? he : enUS}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            aria-label={c.range}
          />
        </div>
      </Specimen>
    </>
  );
}
