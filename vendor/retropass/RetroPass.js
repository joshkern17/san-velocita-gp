var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _RetroPass_colorPalette, _RetroPass_autoDitheringOffset, _RetroPass_autoResolution, _RetroPass_pixelRatio;
import * as THREE from 'three';
import { ShaderPass } from '../addons/postprocessing/ShaderPass.js';
import { RetroShader } from './RetroShader.js';
import { createColorPalette } from './createColorPalette.js';
import { createColorTexture } from './createColorTexture.js';
import { isValidColorCount } from "./isValidColorCount.js";
/**
 * Post-processing pass for applying a retro-style effect with color quantization and dithering
 */
export class RetroPass extends ShaderPass {
    /**
     * Creates a new RetroPass instance
     * @param parameters - Configuration parameters for the retro effect
     */
    constructor({ colorCount = 16, colorPalette, dithering = true, ditheringOffset = 0.2, autoDitheringOffset = false, pixelRatio = 0.25, resolution = new THREE.Vector2(320, 200), autoResolution = false, } = {}) {
        super(RetroShader);
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new THREE.Vector2()
        });
        _RetroPass_colorPalette.set(this, void 0);
        _RetroPass_autoDitheringOffset.set(this, false);
        _RetroPass_autoResolution.set(this, false);
        _RetroPass_pixelRatio.set(this, 0);
        this.dithering = dithering;
        this.ditheringOffset = ditheringOffset;
        this.autoDitheringOffset = autoDitheringOffset;
        this.pixelRatio = pixelRatio;
        this.resolution = resolution;
        this.autoResolution = autoResolution;
        if (colorPalette) {
            this.colorPalette = colorPalette;
        }
        else {
            this.colorCount = colorCount;
        }
    }
    /**
     * Pixel resolution to use
     */
    get resolution() {
        return this.uniforms.uResolution.value;
    }
    set resolution(value) {
        if (!value.equals(this.uniforms.uResolution.value)) {
            this.uniforms.uResolution.value.copy(value);
        }
    }
    /**
     * Whether to automatically update the resolution based on the specified pixelRatio
     */
    get autoResolution() {
        return __classPrivateFieldGet(this, _RetroPass_autoResolution, "f");
    }
    set autoResolution(value) {
        if (__classPrivateFieldGet(this, _RetroPass_autoResolution, "f") !== value) {
            __classPrivateFieldSet(this, _RetroPass_autoResolution, value, "f");
            this.updateResolution();
        }
    }
    /**
     * Pixel ratio to use if autoResolution is true, typically 0.0-1.0 (optional)
     */
    get pixelRatio() {
        return __classPrivateFieldGet(this, _RetroPass_pixelRatio, "f");
    }
    set pixelRatio(value) {
        if (__classPrivateFieldGet(this, _RetroPass_pixelRatio, "f") !== value) {
            __classPrivateFieldSet(this, _RetroPass_pixelRatio, value, "f");
            this.updateResolution();
        }
    }
    /**
     * The number of colors in the palette
     */
    get colorCount() {
        return this.uniforms.uColorCount.value;
    }
    set colorCount(value) {
        if (value !== this.colorCount) {
            if (!isValidColorCount(value)) {
                throw new Error(`Invalid colorPalette, must contain between 2 and 4096 colours`);
            }
            this.uniforms.uIsQuantized.value = true;
            this.setColorPalette(createColorPalette(value));
        }
    }
    /**
     * The current color palette
     */
    get colorPalette() {
        return __classPrivateFieldGet(this, _RetroPass_colorPalette, "f");
    }
    set colorPalette(colors) {
        const colorCount = colors?.length;
        if (!isValidColorCount(colorCount)) {
            throw new Error(`Invalid colorPalette, must contain between 2 and 4096 colours`);
        }
        this.uniforms.uIsQuantized.value = false;
        this.setColorPalette(colors);
    }
    /**
     * Whether or not to apply dithering
     */
    get dithering() {
        return this.uniforms.uDithering.value;
    }
    set dithering(value) {
        this.uniforms.uDithering.value = value;
    }
    /**
     * The amount of dithering to apply, typically 0.0 to 1.0
     */
    get ditheringOffset() {
        return this.uniforms.uDitheringOffset.value;
    }
    set ditheringOffset(value) {
        this.uniforms.uDitheringOffset.value = value;
    }
    /**
     * Whether to automatically update the dithering offset based on the color count
     */
    get autoDitheringOffset() {
        return __classPrivateFieldGet(this, _RetroPass_autoDitheringOffset, "f");
    }
    set autoDitheringOffset(value) {
        if (__classPrivateFieldGet(this, _RetroPass_autoDitheringOffset, "f") !== value) {
            __classPrivateFieldSet(this, _RetroPass_autoDitheringOffset, value, "f");
            if (value) {
                this.updateDitheringOffset();
            }
        }
    }
    /**
     * Whether to invert the image before processing
     */
    get inverted() {
        return this.uniforms.uInverted.value;
    }
    set inverted(value) {
        this.uniforms.uInverted.value = value;
    }
    /**
     * Set the pixel resolution to use (used by EffectComposer)
     * @see {@link RetroPass.resolution}
     */
    setSize(width, height) {
        this.size.set(width, height);
        this.updateResolution();
    }
    /**
     * Updates the resolution based on the current pixel ratio and size
     */
    updateResolution() {
        if (this.autoResolution) {
            this.resolution.set(this.size.x * this.pixelRatio, this.size.y * this.pixelRatio);
        }
    }
    /**
     * Updates the dithering offset based on the current color count
     */
    updateDitheringOffset() {
        if (this.autoDitheringOffset) {
            this.ditheringOffset = 0.03 + 0.97 / (this.colorCount - 1);
        }
    }
    setColorPalette(colors) {
        const colorCount = colors?.length;
        const colorTexture = createColorTexture(colors);
        this.uniforms.uColorCount.value = colorCount;
        this.uniforms.uColorTexture.value?.dispose();
        this.uniforms.uColorTexture.value = colorTexture;
        if (this.autoDitheringOffset) {
            this.updateDitheringOffset();
        }
        __classPrivateFieldSet(this, _RetroPass_colorPalette, colors.slice(), "f");
    }
}
_RetroPass_colorPalette = new WeakMap(), _RetroPass_autoDitheringOffset = new WeakMap(), _RetroPass_autoResolution = new WeakMap(), _RetroPass_pixelRatio = new WeakMap();
