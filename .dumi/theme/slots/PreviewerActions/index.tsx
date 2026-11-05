import DefaultPreviewerActions, {
  type IPreviewerActionsProps,
} from 'dumi/theme-default/slots/PreviewerActions';

export default function PreviewerActions(props: IPreviewerActionsProps) {
  return (
    <DefaultPreviewerActions
      {...props}
      disabledActions={[...(props.disabledActions ?? []), 'CSB', 'STACKBLITZ']}
    />
  );
}
