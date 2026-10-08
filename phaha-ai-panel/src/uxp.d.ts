// Khai báo tối giản cho module "uxp" (Photoshop tự cấp lúc chạy).
declare module "uxp" {
  export const storage: {
    localFileSystem: {
      getFileForOpening(options?: { types?: string[]; allowMultiple?: boolean }): Promise<any>;
      getFolder(options?: any): Promise<any>;
      getTemporaryFolder(): Promise<any>;
    };
    formats: { binary: any; utf8: any };
  };
  export const shell: { openExternal(url: string, message?: string): Promise<any> };
  export const entrypoints: any;
}
