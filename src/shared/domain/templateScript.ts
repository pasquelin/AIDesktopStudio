/**
 * The scripts a scene template lays down beside itself, named once for the three places that
 * have to agree: the component a template writes, the file the seeding creates, and the source
 * each one opens on.
 */
export type TemplateScriptId = 'player' | 'car' | 'plane'

export const TEMPLATE_SCRIPT_IDS: readonly TemplateScriptId[] = ['player', 'car', 'plane']

/**
 * What each one opens on. Named ACTIONS, never a key code: the same body then answers a keyboard
 * and a gamepad alike, and rebinding one is a line of the control map rather than of this file.
 *
 * 🛑 Empty of gameplay on purpose — walking, driving and flying are the runtime's, and a template
 * that reimplemented them would teach a beginner to fight the controller it ships with.
 */
export const TEMPLATE_SCRIPT_SOURCES: Record<TemplateScriptId, string> = {
  player: `import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    // The runtime already walks, runs and jumps this body off the \`character\` context — you have
    // to write nothing at all for a keyboard and a gamepad to move it.
    const walking = ctx.input.axis2('move')

    // To DRIVE it yourself, ask the controller rather than placing the node: gravity, slopes and
    // walls still apply. It takes a DIRECTION — the pace is the CharacterController's — and what
    // you ask replaces the sticks for this step only.
    //   self.walk(walking.x, walking.y)
    //   if (ctx.input.button('jump')) self.jump()

    if (ctx.input.button('interact')) {
      // Whatever standing in front of something means in your game.
    }
  },
})
`,

  car: `import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    // The runtime drives, brakes and steers this body off the \`vehicle\` context.
    const throttle = ctx.input.axis('accelerate') - ctx.input.axis('brake')

    // To drive it yourself — this car alone, whatever the other cars of the scene are doing:
    //   self.drive(throttle, ctx.input.axis('steer'), ctx.input.button('handBrake'))

    if (ctx.input.button('exit')) {
      // Getting out is yours to write: the runtime holds the pedals, not the doors.
    }
  },
})
`,

  plane: `import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    // The runtime flies this body off the \`flight\` context — stick, rudder and throttle.
    const throttle = ctx.input.axis('throttle')

    // To fly it yourself, this aeroplane alone:
    //   self.fly(ctx.input.axis('pitch'), ctx.input.axis('roll'), ctx.input.axis('yaw'), throttle)
  },
})
`,
}
