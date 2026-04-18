#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎨 Design System Generator — авто-генерация дизайн-системы.

Возможности:
- Цветовая палитра
- Typography токены
- Spacing система
- Компоненты
- Темы (light/dark)
- CSS Variables
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class ColorPalette:
    """Цветовая палитра."""
    primary: str = "#3B82F6"
    secondary: str = "#8B5CF6"
    success: str = "#10B981"
    warning: str = "#F59E0B"
    error: str = "#EF4444"
    info: str = "#06B6D4"
    
    # Grayscale
    gray_50: str = "#F9FAFB"
    gray_100: str = "#F3F4F6"
    gray_200: str = "#E5E7EB"
    gray_300: str = "#D1D5DB"
    gray_400: str = "#9CA3AF"
    gray_500: str = "#6B7280"
    gray_600: str = "#4B5563"
    gray_700: str = "#374151"
    gray_800: str = "#1F2937"
    gray_900: str = "#111827"


@dataclass
class Typography:
    """Типографика."""
    font_family: str = "system-ui, -apple-system, sans-serif"
    font_mono: str = "ui-monospace, monospace"
    
    # Sizes
    text_xs: str = "0.75rem"
    text_sm: str = "0.875rem"
    text_base: str = "1rem"
    text_lg: str = "1.125rem"
    text_xl: str = "1.25rem"
    text_2xl: str = "1.5rem"
    text_3xl: str = "1.875rem"
    text_4xl: str = "2.25rem"
    
    # Weights
    font_light: int = 300
    font_normal: int = 400
    font_medium: int = 500
    font_semibold: int = 600
    font_bold: int = 700


class Spacing:
    """Отступы."""
    # Using string keys to avoid numeric attribute issues
    _0: str = "0"
    _1: str = "0.25rem"
    _2: str = "0.5rem"
    _3: str = "0.75rem"
    _4: str = "1rem"
    _5: str = "1.25rem"
    _6: str = "1.5rem"
    _8: str = "2rem"
    _10: str = "2.5rem"
    _12: str = "3rem"
    _16: str = "4rem"
    
    def get(self, key: str) -> str:
        return getattr(self, f"_{key}", "0")


@dataclass
class BorderRadius:
    """Радиусы границ."""
    none: str = "0"
    sm: str = "0.125rem"
    DEFAULT_radius: str = "0.25rem"  # Renamed to avoid shadowing
    md: str = "0.375rem"
    lg: str = "0.5rem"
    xl: str = "0.75rem"
    _2xl: str = "1rem"
    _3xl: str = "1.5rem"
    full: str = "9999px"


class DesignTokens:
    """Генератор дизайн токенов."""
    
    def __init__(
        self,
        name: str = "my-design-system",
        colors: Optional[ColorPalette] = None,
        typography: Optional[Typography] = None,
        spacing: Optional[Spacing] = None,
    ):
        self.name = name
        self.colors = colors or ColorPalette()
        self.typography = typography or Typography()
        self.spacing = spacing or Spacing()
    
    def to_css_variables(self) -> str:
        """CSS Variables."""
        lines = [":root {"]
        
        # Colors
        for key, value in self.colors.__dict__.items():
            lines.append(f"  --color-{key.replace('_', '-')}: {value};")
        
        # Typography
        lines.append(f"  --font-sans: {self.typography.font_family};")
        lines.append(f"  --font-mono: {self.typography.font_mono};")
        
        for size in ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"]:
            attr = f"text_{size}"
            if hasattr(self.typography, attr):
                lines.append(f"  --text-{size}: {getattr(self.typography, attr)};")
        
        # Spacing
        for key, value in self.spacing.__dict__.items():
            lines.append(f"  --space-{key}: {value};")
        
        lines.append("}")
        
        return "\n".join(lines)
    
    def to_json(self) -> dict:
        """JSON токены."""
        return {
            "name": self.name,
            "colors": self.colors.__dict__,
            "typography": {
                "fontFamily": self.typography.font_family,
                "fontMono": self.typography.font_mono,
                "textSizes": {k: getattr(self.typography, f"text_{k}") 
                             for k in ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"]},
            },
            "spacing": self.spacing.__dict__,
        }
    
    def to_js_module(self) -> str:
        """JavaScript модуль."""
        json_data = json.dumps(self.to_json(), indent=2)
        return f"""// Design Tokens
export const tokens = {json_data};

// Helper functions
export const colors = {{
{chr(10).join(f"  {k}: '{v}'," for k, v in self.colors.__dict__.items() if not k.startswith('_'))}
}};

export const spacing = {{
{chr(10).join(f"  {k}: '{v}'," for k, v in self.spacing.__dict__.items() if k.isdigit() or k == '0')}
}};
"""


class ComponentGenerator:
    """Генератор базовых компонентов."""
    
    @staticmethod
    def button(
        variant: str = "primary",
        size: str = "md",
    ) -> str:
        """CSS для кнопки."""
        return f"""
.btn {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}}

.btn-{variant} {{
  background: var(--color-primary);
  color: white;
  border: none;
}}

.btn-{variant}:hover {{
  opacity: 0.9;
}}

.btn-sm {{ padding: 0.25rem 0.5rem; font-size: 0.75rem; }}
.btn-lg {{ padding: 0.75rem 1.5rem; font-size: 1rem; }}
"""
    
    @staticmethod
    def card() -> str:
        """CSS для карточки."""
        return """
.card {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  padding: 1.5rem;
}

.card-header {
  font-weight: 600;
  margin-bottom: 1rem;
}

.card-body {
  color: var(--color-gray-600);
}
"""
    
    @staticmethod
    def input() -> str:
        """CSS для input."""
        return """
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid var(--color-gray-300);
  border-radius: 0.25rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
"""
    
    @staticmethod
    def all_components() -> str:
        """Все компоненты."""
        return (
            ComponentGenerator.button() +
            ComponentGenerator.card() +
            ComponentGenerator.input()
        )


class ThemeGenerator:
    """Генератор тем."""
    
    @staticmethod
    def light() -> str:
        """Light тема."""
        return """
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}
"""
    
    @staticmethod
    def dark() -> str:
        """Dark тема."""
        return """
[data-theme="dark"] {
  --bg-primary: #111827;
  --bg-secondary: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --border-color: #374151;
}
"""
    
    @staticmethod
    def both() -> str:
        """Обе темы + toggle."""
        return """
:root {
  color-scheme: light dark;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}

[data-theme="dark"] {
  --bg-primary: #111827;
  --bg-secondary: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --border-color: #374151;
}

/* Theme toggle */
.theme-toggle {
  padding: 0.5rem;
  cursor: pointer;
}
"""


class DesignSystem:
    """Главная система дизайн-системы."""
    
    def __init__(
        self,
        name: str = "my-design-system",
        colors: Optional[ColorPalette] = None,
    ):
        self.name = name
        self.tokens = DesignTokens(name, colors)
        self.components = ComponentGenerator()
        self.themes = ThemeGenerator()
    
    def generate_css(self, include_components: bool = True) -> str:
        """Сгенерировать полный CSS."""
        parts = [
            "/* Design System: " + self.name + " */",
            self.tokens.to_css_variables(),
            self.themes.both(),
        ]
        
        if include_components:
            parts.append(self.components.all_components())
        
        return "\n\n".join(parts)
    
    def generate_storybook(self) -> str:
        """Сгенерировать Storybook stories."""
        return """// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};
"""
    
    def generate_tailwind_config(self) -> str:
        """Tailwind конфиг."""
        colors = self.tokens.colors.__dict__
        
        return f"""// tailwind.config.js
module.exports = {{
  theme: {{
    extend: {{
      colors: {{
        primary: '{colors.get('primary', '#3B82F6')}',
        secondary: '{colors.get('secondary', '#8B5CF6')}',
        success: '{colors.get('success', '#10B981')}',
        warning: '{colors.get('warning', '#F59E0B')}',
        error: '{colors.get('error', '#EF4444')}',
      }},
      fontFamily: {{
        sans: ['{self.tokens.typography.font_family}'],
        mono: ['{self.tokens.typography.font_mono}'],
      }},
    }},
  }},
}}
"""


# =============================================================================
# Global
# =============================================================================

def create_design_system(
    name: str = "my-design-system",
    primary_color: str = "#3B82F6",
) -> DesignSystem:
    """Создать дизайн-систему."""
    colors = ColorPalette(primary=primary_color)
    return DesignSystem(name, colors)


if __name__ == "__main__":
    ds = create_design_system()
    print("🎨 Design System ready")
    print(ds.tokens.to_css_variables()[:500])