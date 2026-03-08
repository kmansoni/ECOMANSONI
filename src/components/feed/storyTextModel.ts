export interface TextLayer {
  id: string;
  text: string;
  font: string;
  color: string;
  align: "left" | "center" | "right";
  background: boolean;
  x: number;
  y: number;
  fontSize: number;
}
