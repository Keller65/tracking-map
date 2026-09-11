"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { MagnifyingGlass } from "@phosphor-icons/react"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command"
import { items, canViewMenu } from "@/app/dashboard/app-sidebar"

export function CommandMenu() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { data: session } = useSession()

  const menus = session?.user?.menus

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSelect = (url: string) => {
    setOpen(false)
    router.push(url)
  }

  const groups = items
    .map((g) => ({ ...g, items: g.items.filter((i) => canViewMenu(i.url, menus)) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      {/* <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors border rounded-full px-3 py-1.5 bg-muted/50"
      >
        <MagnifyingGlass size={16} />
        <span className="hidden md:inline">Buscar...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button> */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar pantalla..." />
        <CommandList>
          <CommandEmpty>No se encontró ningún resultado.</CommandEmpty>
          {groups.map((group, idx) => (
            <React.Fragment key={group.title}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group.title}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.url + item.title}
                    value={`${group.title} ${item.title}`}
                    onSelect={() => handleSelect(item.url)}
                    className="cursor-pointer"
                  >
                    <item.icon size={18} />
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
