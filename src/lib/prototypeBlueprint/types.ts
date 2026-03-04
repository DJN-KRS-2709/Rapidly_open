/**
 * TypeScript types for UI Blueprint.
 * Aligned with ui_blueprint.schema.json.
 */

export interface UiBlueprintScreen {
  id: string;
  title: string;
  route: string;
  layout?: 'default';
  regions?: UiBlueprintRegion[];
  components?: UiBlueprintComponent[];
  tabs?: UiBlueprintTab[];
}

export interface UiBlueprintRegion {
  id: string;
  layout: string;
  children?: UiBlueprintComponent[];
}

export interface UiBlueprintComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: UiBlueprintComponent[];
}

export interface UiBlueprintTab {
  id: string;
  label: string;
  content?: {
    tableColumns?: string[];
    columnKeys?: string[];
    tableRows?: Record<string, unknown>[];
    placeholder?: string;
  };
}

export interface UiBlueprintInteraction {
  id: string;
  targetComponentId: string;
  event: 'click' | 'input' | 'change';
  actionType: 'navigate' | 'switchTab' | 'openDetail' | 'filter' | 'sort';
  destinationRoute?: string;
  payload?: Record<string, unknown>;
}

export interface UiBlueprintDataPlaceholder {
  id: string;
  description: string;
  screenId?: string;
  defaultData?: unknown[];
}

export interface UiBlueprint {
  appName: string;
  screens: UiBlueprintScreen[];
  interactions?: UiBlueprintInteraction[];
  dataPlaceholders?: UiBlueprintDataPlaceholder[];
}
