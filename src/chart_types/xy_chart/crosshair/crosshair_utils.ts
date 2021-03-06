/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { TooltipAnchorPosition } from '../../../components/tooltip/types';
import { Scale } from '../../../scales';
import { Rotation } from '../../../utils/commons';
import { Dimensions } from '../../../utils/dimensions';
import { Point } from '../../../utils/point';
import { isHorizontalRotation, isVerticalRotation } from '../state/utils/common';
import { ChartDimensions } from '../utils/dimensions';

export interface SnappedPosition {
  position: number;
  band: number;
}

export const DEFAULT_SNAP_POSITION_BAND = 1;

/** @internal */
export function getSnapPosition(
  value: string | number,
  scale: Scale,
  totalBarsInCluster = 1,
): { band: number; position: number } | undefined {
  const position = scale.scale(value);
  if (position === null) {
    return;
  }

  if (scale.bandwidth > 0) {
    const band = scale.bandwidth / (1 - scale.barsPadding);

    const halfPadding = (band - scale.bandwidth) / 2;
    return {
      position: position - halfPadding * totalBarsInCluster,
      band: band * totalBarsInCluster,
    };
  }
  return {
    position,
    band: DEFAULT_SNAP_POSITION_BAND,
  };
}

/** @internal */
export function getCursorLinePosition(
  chartRotation: Rotation,
  chartDimensions: Dimensions,
  projectedPointerPosition: { x: number; y: number },
): Dimensions | undefined {
  const { x, y } = projectedPointerPosition;
  if (x < 0 || y < 0) {
    return void 0;
  }
  const { left, top, width, height } = chartDimensions;
  const isHorizontalRotated = isHorizontalRotation(chartRotation);
  if (isHorizontalRotated) {
    const crosshairTop = projectedPointerPosition.y + top;
    return {
      left,
      width,
      top: crosshairTop,
      height: 0,
    };
  }
  const crosshairLeft = projectedPointerPosition.x + left;

  return {
    top,
    left: crosshairLeft,
    width: 0,
    height,
  };
}

/** @internal */
export function getCursorBandPosition(
  chartRotation: Rotation,
  chartDimensions: Dimensions,
  cursorPosition: Point,
  invertedValue: {
    value: any;
    withinBandwidth: boolean;
  },
  snapEnabled: boolean,
  xScale: Scale,
  totalBarsInCluster?: number,
): Dimensions & { visible: boolean } {
  const { top, left, width, height } = chartDimensions;
  const { x, y } = cursorPosition;
  const isHorizontalRotated = isHorizontalRotation(chartRotation);
  const chartWidth = isHorizontalRotated ? width : height;
  const chartHeight = isHorizontalRotated ? height : width;

  if (x > chartWidth || y > chartHeight || x < 0 || y < 0 || !invertedValue.withinBandwidth) {
    return {
      top: -1,
      left: -1,
      width: 0,
      height: 0,
      visible: false,
    };
  }
  const snappedPosition = getSnapPosition(invertedValue.value, xScale, totalBarsInCluster);
  if (!snappedPosition) {
    return {
      top: -1,
      left: -1,
      width: 0,
      height: 0,
      visible: false,
    };
  }

  const { position, band } = snappedPosition;
  const bandOffset = xScale.bandwidth > 0 ? band : 0;

  if (isHorizontalRotated) {
    const adjustedLeft = snapEnabled ? position : cursorPosition.x;
    let leftPosition = chartRotation === 0 ? left + adjustedLeft : left + width - adjustedLeft - bandOffset;
    let adjustedWidth = band;
    if (band > 1 && leftPosition + band > left + width) {
      adjustedWidth = left + width - leftPosition;
    } else if (band > 1 && leftPosition < left) {
      adjustedWidth = band - (left - leftPosition);
      leftPosition = left;
    }
    return {
      top,
      left: leftPosition,
      width: adjustedWidth,
      height,
      visible: true,
    };
  }
  const adjustedTop = snapEnabled ? position : cursorPosition.x;
  let topPosition = chartRotation === 90 ? top + adjustedTop : height + top - adjustedTop - bandOffset;
  let adjustedHeight = band;
  if (band > 1 && topPosition + band > top + height) {
    adjustedHeight = band - (topPosition + band - (top + height));
  } else if (band > 1 && topPosition < top) {
    adjustedHeight = band - (top - topPosition);
    topPosition = top;
  }
  return {
    top: topPosition,
    left,
    width,
    height: adjustedHeight,
    visible: true,
  };
}

/** @internal */
export function getTooltipAnchorPosition(
  { chartDimensions, offset }: ChartDimensions,
  chartRotation: Rotation,
  cursorBandPosition: Dimensions,
  cursorPosition: { x: number; y: number },
): TooltipAnchorPosition {
  const isRotated = isVerticalRotation(chartRotation);
  const hPosition = getHorizontalTooltipPosition(
    cursorPosition.x,
    cursorBandPosition,
    chartDimensions,
    offset.left,
    isRotated,
  );
  const vPosition = getVerticalTooltipPosition(
    cursorPosition.y,
    cursorBandPosition,
    chartDimensions,
    offset.top,
    isRotated,
  );
  return {
    isRotated,
    ...vPosition,
    ...hPosition,
  };
}

function getHorizontalTooltipPosition(
  cursorXPosition: number,
  cursorBandPosition: Dimensions,
  chartDimensions: Dimensions,
  globalOffset: number,
  isRotated: boolean,
): { x0?: number; x1: number } {
  if (!isRotated) {
    return {
      x0: cursorBandPosition.left + globalOffset,
      x1: cursorBandPosition.left + cursorBandPosition.width + globalOffset,
    };
  }
  return {
    // NOTE: x0 set to zero blocks tooltip placement on left when rotated 90 deg
    // Delete this comment before merging and verifing this doesn't break anything.
    x1: chartDimensions.left + cursorXPosition + globalOffset,
  };
}

function getVerticalTooltipPosition(
  cursorYPosition: number,
  cursorBandPosition: Dimensions,
  chartDimensions: Dimensions,
  globalOffset: number,
  isRotated: boolean,
): {
  y0: number;
  y1: number;
} {
  if (!isRotated) {
    const y = cursorYPosition + chartDimensions.top + globalOffset;
    return {
      y0: y,
      y1: y,
    };
  }
  return {
    y0: cursorBandPosition.top + globalOffset,
    y1: cursorBandPosition.height + cursorBandPosition.top + globalOffset,
  };
}
