declare module '*.css';

declare module '*?url' {
  const content: string;
  export default content;
}

