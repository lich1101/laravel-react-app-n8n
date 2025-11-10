import React from 'react';
import ExpandableTextarea from './ExpandableTextarea';

const VariableInput = ({ value, onChange, inputData, rows = 1, ...props }) => {
    const handleChange = (newValue) => {
        if (onChange) {
            onChange(newValue);
        }
    };

    return (
        <ExpandableTextarea
            value={value}
            onChange={handleChange}
            inputData={inputData}
            rows={rows}
            {...props}
        />
    );
};

export default VariableInput;
