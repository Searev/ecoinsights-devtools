/*
 *  Copyright (C) 2019 - 2022  didierfred@gmail.com
 *  Copyright (C) 2023 - 2024  bastienhub@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { round } from "../../helpers/math.helpers";
import { Impact } from "../models/impact";
import reference from "ecoindex_reference";

export type EcoIndexGrade = {
  value: number;
  grade: string;
  color: string;
};

const gradesFromHighestToLowest: EcoIndexGrade[] = reference.grades.sort(
  (a, b) => b.value - a.value
);

export function computeEcoIndexAndEnvironmentalImpact(
  domSize: number,
  nbRequests: number,
  requestsSize: number
): Impact {
  const ecoindex = computeEcoIndex(domSize, nbRequests, requestsSize);
  const greenhouseGasEmissions =
    computeGreenhouseGasesEmissionfromEcoIndex(ecoindex);
  const blueWaterConsumption = computeWaterConsumptionfromEcoIndex(ecoindex);

  return {
    ecoindex,
    greenhouseGasEmissions,
    blueWaterConsumption,
  };
}

export function getEcoIndexGrade(ecoIndex: number): EcoIndexGrade | undefined {
  // We are looking for the highest grade such as its value is inferior to our ecoIndex
  return gradesFromHighestToLowest.find(({ value }) => ecoIndex > value);
}

/**
 * Calcul ecoIndex based on formula from web site www.ecoindex.fr
 **/
function computeEcoIndex(dom: number, req: number, size: number) {
  const { dom_size, nb_request, response_size } = reference.quantiles;
  const q_dom = computeQuantile(dom_size, dom);
  const q_req = computeQuantile(nb_request, req);
  const q_size = computeQuantile(response_size, size);

  return round(100 - (5 * (3 * q_dom + 2 * q_req + q_size)) / 6);
}

function computeQuantile(quantiles: number[], value: number) {
  for (let i = 1; i < quantiles.length; i++) {
    if (value < quantiles[i]) {
      return (
        i - 1 + (value - quantiles[i - 1]) / (quantiles[i] - quantiles[i - 1])
      );
    }
  }
  return quantiles.length - 1;
}

function computeGreenhouseGasesEmissionfromEcoIndex(ecoIndex: number) {
  return round(2 + (2 * (50 - ecoIndex)) / 100);
}

function computeWaterConsumptionfromEcoIndex(ecoIndex: number) {
  return round(3 + (3 * (50 - ecoIndex)) / 100);
}
