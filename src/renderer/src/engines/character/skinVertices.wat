(module
  (memory (export "memory") 1)

  (func (export "skinRange")
    (param $positions i32) (param $segments i32) (param $regions i32)
    (param $bones i32) (param $indices i32) (param $weights i32)
    (param $from i32) (param $to i32)
    (local $vertex i32) (local $bone i32) (local $slot i32) (local $held i32)
    (local $nearest i32) (local $region i32) (local $boneRegion i32)
    (local $x f64) (local $y f64) (local $z f64)
    (local $hx f64) (local $hy f64) (local $hz f64)
    (local $ax f64) (local $ay f64) (local $az f64)
    (local $length f64) (local $along f64) (local $dx f64) (local $dy f64) (local $dz f64)
    (local $distance f64) (local $nearestDistance f64) (local $total f64) (local $pull f64)

    (local.set $vertex (local.get $from))
    (block $done
      (loop $vertices
        (br_if $done (i32.ge_u (local.get $vertex) (local.get $to)))
        (local.set $x (f64.promote_f32 (f32.load (i32.add (local.get $positions) (i32.mul (local.get $vertex) (i32.const 12))))))
        (local.set $y (f64.promote_f32 (f32.load (i32.add (local.get $positions) (i32.add (i32.mul (local.get $vertex) (i32.const 12)) (i32.const 4))))))
        (local.set $z (f64.promote_f32 (f32.load (i32.add (local.get $positions) (i32.add (i32.mul (local.get $vertex) (i32.const 12)) (i32.const 8))))))
        (local.set $nearest (i32.const 0))
        (local.set $nearestDistance (f64.const inf))
        (local.set $held (i32.const 0))
        (local.set $bone (i32.const 0))
        (block $distancesDone
          (loop $distances
            (br_if $distancesDone (i32.ge_u (local.get $bone) (local.get $bones)))
            (local.set $hx (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.mul (local.get $bone) (i32.const 24))))))
            (local.set $hy (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.add (i32.mul (local.get $bone) (i32.const 24)) (i32.const 4))))))
            (local.set $hz (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.add (i32.mul (local.get $bone) (i32.const 24)) (i32.const 8))))))
            (local.set $ax (f64.sub (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.add (i32.mul (local.get $bone) (i32.const 24)) (i32.const 12))))) (local.get $hx)))
            (local.set $ay (f64.sub (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.add (i32.mul (local.get $bone) (i32.const 24)) (i32.const 16))))) (local.get $hy)))
            (local.set $az (f64.sub (f64.promote_f32 (f32.load (i32.add (local.get $segments) (i32.add (i32.mul (local.get $bone) (i32.const 24)) (i32.const 20))))) (local.get $hz)))
            (local.set $length (f64.add (f64.add (f64.mul (local.get $ax) (local.get $ax)) (f64.mul (local.get $ay) (local.get $ay))) (f64.mul (local.get $az) (local.get $az))))
            (local.set $along (f64.const 0))
            (if (f64.ne (local.get $length) (f64.const 0))
              (then
                (local.set $along (f64.div (f64.add (f64.add (f64.mul (f64.sub (local.get $x) (local.get $hx)) (local.get $ax)) (f64.mul (f64.sub (local.get $y) (local.get $hy)) (local.get $ay))) (f64.mul (f64.sub (local.get $z) (local.get $hz)) (local.get $az))) (local.get $length)))
                (if (f64.lt (local.get $along) (f64.const 0)) (then (local.set $along (f64.const 0))))
                (if (f64.gt (local.get $along) (f64.const 1)) (then (local.set $along (f64.const 1))))))
            (local.set $dx (f64.sub (local.get $x) (f64.add (local.get $hx) (f64.mul (local.get $ax) (local.get $along)))))
            (local.set $dy (f64.sub (local.get $y) (f64.add (local.get $hy) (f64.mul (local.get $ay) (local.get $along)))))
            (local.set $dz (f64.sub (local.get $z) (f64.add (local.get $hz) (f64.mul (local.get $az) (local.get $along)))))
            (local.set $distance (f64.sqrt (f64.add (f64.add (f64.mul (local.get $dx) (local.get $dx)) (f64.mul (local.get $dy) (local.get $dy))) (f64.mul (local.get $dz) (local.get $dz)))))
            (f64.store (i32.mul (local.get $bone) (i32.const 8)) (local.get $distance))
            (if (f64.lt (local.get $distance) (local.get $nearestDistance))
              (then (local.set $nearestDistance (local.get $distance)) (local.set $nearest (local.get $bone))))
            (local.set $bone (i32.add (local.get $bone) (i32.const 1)))
            (br $distances)))
        (local.set $region (i32.load8_u (i32.add (local.get $regions) (local.get $nearest))))
        (local.set $held (i32.const 0))
        (local.set $bone (i32.const 0))
        (block $candidatesDone
          (loop $candidates
            (br_if $candidatesDone (i32.ge_u (local.get $bone) (local.get $bones)))
            (local.set $boneRegion (i32.load8_u (i32.add (local.get $regions) (local.get $bone))))
            (block $candidateDone
              (br_if $candidateDone (i32.eq (local.get $boneRegion) (i32.const 6)))
              (br_if $candidateDone (i32.eqz
                (i32.or
                  (i32.or (i32.eqz (local.get $boneRegion)) (i32.eq (local.get $boneRegion) (local.get $region)))
                  (i32.or
                    (i32.and (i32.ge_u (local.get $region) (i32.const 7)) (i32.and (i32.le_u (local.get $region) (i32.const 11)) (i32.eq (local.get $boneRegion) (i32.const 2))))
                    (i32.and (i32.ge_u (local.get $region) (i32.const 12)) (i32.and (i32.le_u (local.get $region) (i32.const 16)) (i32.eq (local.get $boneRegion) (i32.const 3))))))))
              (local.set $distance (f64.load (i32.mul (local.get $bone) (i32.const 8))))
              (br_if $candidateDone
                (i32.and (i32.eq (local.get $held) (i32.const 4))
                  (f64.ge (local.get $distance) (f64.load (i32.const 32800)))))
              (local.set $slot (local.get $held))
              (if (i32.ge_u (local.get $slot) (i32.const 4)) (then (local.set $slot (i32.const 3))))
              (block $insertDone
                (loop $insert
                  (br_if $insertDone (i32.eqz (local.get $slot)))
                  (br_if $insertDone (f64.le
                    (f64.load (i32.add (i32.const 32776) (i32.mul (i32.sub (local.get $slot) (i32.const 1)) (i32.const 8))))
                    (local.get $distance)))
                  (i32.store16
                    (i32.add (i32.const 32768) (i32.mul (local.get $slot) (i32.const 2)))
                    (i32.load16_u (i32.add (i32.const 32768) (i32.mul (i32.sub (local.get $slot) (i32.const 1)) (i32.const 2)))))
                  (f64.store
                    (i32.add (i32.const 32776) (i32.mul (local.get $slot) (i32.const 8)))
                    (f64.load (i32.add (i32.const 32776) (i32.mul (i32.sub (local.get $slot) (i32.const 1)) (i32.const 8)))))
                  (local.set $slot (i32.sub (local.get $slot) (i32.const 1)))
                  (br $insert)))
              (i32.store16 (i32.add (i32.const 32768) (i32.mul (local.get $slot) (i32.const 2))) (local.get $bone))
              (f64.store (i32.add (i32.const 32776) (i32.mul (local.get $slot) (i32.const 8))) (local.get $distance))
              (if (i32.lt_u (local.get $held) (i32.const 4))
                (then (local.set $held (i32.add (local.get $held) (i32.const 1))))))
            (local.set $bone (i32.add (local.get $bone) (i32.const 1)))
            (br $candidates)))
        (local.set $total (f64.const 0))
        (local.set $slot (i32.const 0))
        (block $totalDone (loop $sum
          (br_if $totalDone (i32.ge_u (local.get $slot) (local.get $held)))
          (local.set $distance (f64.add (f64.load (i32.add (i32.const 32776) (i32.mul (local.get $slot) (i32.const 8)))) (f64.const 0.000001)))
          (local.set $total (f64.add (local.get $total) (f64.div (f64.const 1) (f64.mul (local.get $distance) (local.get $distance)))))
          (local.set $slot (i32.add (local.get $slot) (i32.const 1))) (br $sum)))
        (local.set $slot (i32.const 0))
        (block $writeDone (loop $write
          (br_if $writeDone (i32.ge_u (local.get $slot) (local.get $held)))
          (i32.store16 (i32.add (local.get $indices) (i32.mul (i32.add (i32.mul (local.get $vertex) (i32.const 4)) (local.get $slot)) (i32.const 2))) (i32.load16_u (i32.add (i32.const 32768) (i32.mul (local.get $slot) (i32.const 2)))))
          (local.set $distance (f64.add (f64.load (i32.add (i32.const 32776) (i32.mul (local.get $slot) (i32.const 8)))) (f64.const 0.000001)))
          (local.set $pull (f64.div (f64.const 1) (f64.mul (local.get $distance) (local.get $distance))))
          (f32.store (i32.add (local.get $weights) (i32.mul (i32.add (i32.mul (local.get $vertex) (i32.const 4)) (local.get $slot)) (i32.const 4))) (f32.demote_f64 (f64.div (local.get $pull) (local.get $total))))
          (local.set $slot (i32.add (local.get $slot) (i32.const 1))) (br $write)))
        (local.set $vertex (i32.add (local.get $vertex) (i32.const 1)))
        (br $vertices))))
)
