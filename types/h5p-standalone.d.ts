// Minimal ambient types for h5p-standalone (the package ships a runtime bundle
// but doesn't advertise a declaration). We only type the surface we use.
declare module "h5p-standalone" {
  export interface H5POptions {
    h5pJsonPath: string;
    librariesPath?: string;
    contentJsonPath?: string;
    frameJs: string;
    frameCss: string;
    /** Extra stylesheet(s), loaded after the libraries' own. */
    customCss?: string | string[];
    frame?: boolean;
    fullScreen?: boolean;
    export?: boolean;
    copyright?: boolean;
  }

  export class H5P {
    constructor(element: HTMLElement, options: H5POptions);
    then(onFulfilled: () => void): Promise<void>;
  }
}
