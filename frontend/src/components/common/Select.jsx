import { Children, useMemo } from 'react';
import ReactSelect from 'react-select';

const SelectField = ({
  options = [],
  children,
  value,
  onChange,
  placeholder = 'Select...',
  isDisabled = false,
  disabled = false,
  isClearable = false,
  isSearchable = true,
  className,
  style,
  styles,
  name,
  id,
  menuPortalTarget = typeof document !== 'undefined' ? document.body : null,
  ...props
}) => {
  const resolvedOptions = useMemo(() => {
    if (options.length) return options;
    const nodes = Children.toArray(children);
    const mapped = [];

    nodes.forEach((node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'optgroup') {
        const groupOptions = Children.toArray(node.props.children)
          .filter(Boolean)
          .map((child) => ({
            value: child.props.value,
            label: child.props.children,
            isDisabled: !!child.props.disabled,
          }));
        mapped.push({ label: node.props.label, options: groupOptions });
        return;
      }
      if (node.type === 'option') {
        mapped.push({
          value: node.props.value,
          label: node.props.children,
          isDisabled: !!node.props.disabled,
        });
      }
    });

    return mapped;
  }, [children, options]);

  const selectedOption = useMemo(() => {
    if (value && typeof value === 'object' && value.value !== undefined) {
      return value;
    }
    const flatOptions = Array.isArray(resolvedOptions)
      ? resolvedOptions.flatMap((option) => (option.options ? option.options : option))
      : [];
    const match = flatOptions.find((option) => String(option.value) === String(value));
    return match || null;
  }, [resolvedOptions, value]);

  const handleChange = (option) => {
    if (!onChange) return;
    if (Array.isArray(option)) {
      onChange({ target: { value: option.map((item) => item.value), name, id } });
      return;
    }
    onChange({ target: { value: option ? option.value : '', name, id } });
  };

  const mergedStyles = useMemo(() => {
    if (!style && !styles) return styles;
    return {
      ...styles,
      control: (base, state) => {
        const baseStyles = styles?.control ? styles.control(base, state) : base;
        return { ...baseStyles, ...style };
      },
    };
  }, [style, styles]);

  return (
    <ReactSelect
      className={className}
      classNamePrefix="vip-select"
      options={resolvedOptions}
      value={selectedOption}
      onChange={handleChange}
      placeholder={placeholder}
      isDisabled={isDisabled || disabled}
      isClearable={isClearable}
      isSearchable={isSearchable}
      name={name}
      inputId={id}
      styles={mergedStyles}
      menuPortalTarget={menuPortalTarget}
      menuPosition={menuPortalTarget ? 'fixed' : 'absolute'}
      {...props}
    />
  );
};

export default SelectField;
