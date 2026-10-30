import { useEffect, useMemo, useRef } from "react";
import { MeshStandardMaterial, type InstancedMesh } from "three";

import { MAX_STRAYS, type Bookshop } from "./bookshop";

/** The books on the shelves, and the ones out of place, as the bookshop has them. */
export function Books({ shop }: { shop: Bookshop }) {
  const shelf = useRef<InstancedMesh>(null);
  const strays = useRef<InstancedMesh>(null);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), []);
  useEffect(() => {
    if (shelf.current && strays.current) shop.attach(shelf.current, strays.current);
  }, [shop]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <>
      <instancedMesh ref={shelf} args={[undefined, material, shop.books.length]}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={strays} args={[undefined, material, MAX_STRAYS]} frustumCulled={false}>
        <boxGeometry />
      </instancedMesh>
    </>
  );
}
