import CalendarRange from "lucide-react/dist/esm/icons/calendar-range";
import Crosshair from "lucide-react/dist/esm/icons/crosshair";
import Plane from "lucide-react/dist/esm/icons/plane";
import type { SyncSettings } from "@keeper.sh/data-schemas";
import { MAX_SKIP_KEYWORDS, normalizeSkipKeywords } from "@keeper.sh/data-schemas";
import { getCommercialMode } from "@/config/commercial";
import { DashboardSection } from "@/components/ui/primitives/dashboard-heading";
import { MenuGate, MenuHint } from "@/components/ui/primitives/menu-hint";
import {
  NavigationMenu,
  NavigationMenuItemIcon,
  NavigationMenuItemLabel,
  NavigationMenuToggleItem,
} from "@/components/ui/composites/navigation-menu/navigation-menu-items";
import { NavigationMenuEditableItem } from "@/components/ui/composites/navigation-menu/navigation-menu-editable";
import { keywordProblem } from "../sync-draft";
import { UPGRADE_ACTION } from "../sync-plan";
import { RowRemoveButton } from "./row-remove-button";
import { RuleRow } from "./rule-row";

type SkipKey = "skipAllDay" | "skipFocusTime" | "skipOutOfOffice";

const SKIP_ROWS: { icon: typeof Plane; key: SkipKey; label: string }[] = [
  { icon: CalendarRange, key: "skipAllDay", label: "All-Day Events" },
  { icon: Crosshair, key: "skipFocusTime", label: "Focus Time" },
  { icon: Plane, key: "skipOutOfOffice", label: "Out of Office" },
];

interface NeverCopySectionProps {
  settings: SyncSettings;
  locked: boolean;
  onChange: (patch: Partial<SyncSettings>) => void;
}

/* Locked, each control that would add a skip is disabled rather than the whole menu, so a sync that already
 * has skips can still drop them, and keyboard users are held to the same rule as the pointer. */
export function NeverCopySection({ settings, locked, onChange }: NeverCopySectionProps) {
  const keywords = settings.skipTitleKeywords;
  const problem = keywordProblem(keywords);
  const addKeyword = (keyword: string) => {
    const next = normalizeSkipKeywords([...keywords, keyword]);
    if (next.length !== keywords.length) onChange({ skipTitleKeywords: next });
  };

  return (
    <>
      <DashboardSection title="Never Copy" description="Events that stay behind, whatever the rules below say." />
      <MenuGate active={locked && getCommercialMode()} hint="Skipping events is a Pro feature." action={UPGRADE_ACTION}>
        <NavigationMenu>
          {SKIP_ROWS.map(({ icon: Icon, key, label }) => (
            <NavigationMenuToggleItem
              key={key}
              checked={settings[key]}
              disabled={locked && !settings[key]}
              onCheckedChange={(checked) => onChange({ [key]: checked })}
            >
              <NavigationMenuItemIcon>
                <Icon size={15} />
              </NavigationMenuItemIcon>
              <NavigationMenuItemLabel>{label}</NavigationMenuItemLabel>
            </NavigationMenuToggleItem>
          ))}
          {keywords.map((keyword) => (
            <RuleRow
              key={keyword}
              label="Titled"
              value={`“${keyword}”`}
              trailing={(
                <RowRemoveButton
                  label={`Stop skipping events titled ${keyword}`}
                  onClick={() => onChange({ skipTitleKeywords: keywords.filter((candidate) => candidate !== keyword) })}
                />
              )}
            />
          ))}
          {keywords.length < MAX_SKIP_KEYWORDS && (
            <NavigationMenuEditableItem label="Skip Titles With" value="" disabled={locked} onCommit={addKeyword} />
          )}
        </NavigationMenu>
      </MenuGate>
      {problem && <MenuHint tone="danger">{problem}</MenuHint>}
    </>
  );
}
