export type MediaPickerItem = {
  id: string;
  name: string;
  url: string;
  kind: "image" | "video";
  size?: number;
  createdAt?: string;
  folderPath?: string;
};

export type MediaPickerFolder = {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
};

export type PickerMode = "single" | "multi";

export type PickerSelection = {
  items: MediaPickerItem[];
  mode: PickerMode;
};
