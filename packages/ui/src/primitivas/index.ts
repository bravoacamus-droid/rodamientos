/**
 * Barrel de primitivas.
 *
 * Regla de nomenclatura del paquete: las primitivas conservan su nombre en
 * INGLÉS (Button, Dialog, Popover…) porque así se reconocen y así están
 * documentadas en shadcn/ui y Radix. Solo los componentes de dominio del ERP
 * llevan nombre en español (Moneda, EstadoBadge, BuscadorProductos…).
 */

export { Badge, badgeVariants, type BadgeProps } from "./badge";
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Calendar, type CalendarProps } from "./calendar";
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
export { Checkbox, CheckboxCampo } from "./checkbox";
export { Combobox, type ComboboxProps, type OpcionCombobox } from "./combobox";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
  useAtajoPaleta,
} from "./command";
export { DatePicker, type DatePickerProps } from "./date-picker";
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormResumenErrores,
} from "./form";
export { campoBase, Input, SelectNativo, Textarea, type InputProps } from "./input";
export { Campo, Label, type LabelProps } from "./label";
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";
export { RadioCampo, RadioGroup, RadioGroupItem } from "./radio-group";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Separator } from "./separator";
export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
export { Skeleton, SkeletonTabla, SkeletonTarjetas, SkeletonTexto } from "./skeleton";
export { Toaster, toast } from "./sonner";
export { Table, TableContenedor, TBody, TdNum, TFoot, THead, ThNum } from "./table";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export { Switch, SwitchCampo } from "./switch";
export { Tooltip, TooltipContent, TooltipProvider, TooltipSimple, TooltipTrigger } from "./tooltip";
